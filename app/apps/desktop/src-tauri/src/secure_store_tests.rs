use super::*;
use std::sync::Mutex;

/// In-memory keychain slot; `fail_with` makes every call fail with that code.
#[derive(Default)]
struct FakeVault {
    value: Mutex<Option<String>>,
    fail_with: Option<SecureStoreErrorCode>,
}

impl FakeVault {
    fn failing(code: SecureStoreErrorCode) -> Self {
        Self {
            value: Mutex::new(None),
            fail_with: Some(code),
        }
    }

    fn check(&self) -> Result<(), SecureStoreErrorCode> {
        self.fail_with.map_or(Ok(()), Err)
    }
}

impl Vault for FakeVault {
    fn read(&self) -> Result<Option<String>, SecureStoreErrorCode> {
        self.check()?;
        Ok(self.value.lock().unwrap().clone())
    }

    fn write(&self, value: &str) -> Result<(), SecureStoreErrorCode> {
        self.check()?;
        *self.value.lock().unwrap() = Some(value.to_owned());
        Ok(())
    }

    fn remove(&self) -> Result<(), SecureStoreErrorCode> {
        self.check()?;
        *self.value.lock().unwrap() = None;
        Ok(())
    }
}

const RECORD: &str =
    r#"{"v":1,"sessionId":"s1","secret":"q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C"}"#;

fn invalid() -> Result<(), SecureStoreError> {
    Err(SecureStoreError {
        code: SecureStoreErrorCode::InvalidArgument,
    })
}

#[test]
fn stores_replaces_and_deletes_one_secret() {
    let store = SecureStore::new(Box::new(FakeVault::default()));
    assert_eq!(store.get(), Ok(None));
    store.set("first").unwrap();
    store.set(RECORD).unwrap();
    assert_eq!(store.get(), Ok(Some(RECORD.to_owned())));
    store.delete().unwrap();
    assert_eq!(store.get(), Ok(None));
    assert_eq!(
        store.delete(),
        Ok(()),
        "deleting a missing entry is idempotent"
    );
}

#[test]
fn rejects_empty_oversized_and_non_printable_values_before_the_keychain() {
    let store = SecureStore::new(Box::new(FakeVault::default()));
    assert_eq!(store.set(""), invalid());
    assert_eq!(store.set(&"a".repeat(MAX_SECRET_BYTES + 1)), invalid());
    assert_eq!(store.set("line\nbreak"), invalid());
    assert_eq!(store.set("tab\there"), invalid());
    assert_eq!(store.set("não-ascii"), invalid());
    assert_eq!(store.get(), Ok(None), "nothing was written");
    assert_eq!(store.set(&"a".repeat(MAX_SECRET_BYTES)), Ok(()));
}

#[test]
fn passes_vault_failures_through_as_stable_codes() {
    let store = SecureStore::new(Box::new(FakeVault::failing(
        SecureStoreErrorCode::Unavailable,
    )));
    let unavailable = SecureStoreError {
        code: SecureStoreErrorCode::Unavailable,
    };
    assert_eq!(store.get(), Err(unavailable));
    assert_eq!(store.set(RECORD), Err(unavailable));
    assert_eq!(store.delete(), Err(unavailable));
}

#[test]
fn maps_keyring_errors_without_their_payload() {
    use keyring::Error;
    assert_eq!(
        map_keyring_error(&Error::NoDefaultStore),
        SecureStoreErrorCode::Unavailable
    );
    assert_eq!(
        map_keyring_error(&Error::NoStorageAccess("locked".into())),
        SecureStoreErrorCode::Unavailable
    );
    assert_eq!(
        map_keyring_error(&Error::PlatformFailure("dbus".into())),
        SecureStoreErrorCode::Unavailable
    );
    assert_eq!(
        map_keyring_error(&Error::TooLong("password".into(), 2560)),
        SecureStoreErrorCode::InvalidArgument
    );
    assert_eq!(
        map_keyring_error(&Error::BadEncoding(b"secret-bytes".to_vec())),
        SecureStoreErrorCode::Failed
    );
}

#[test]
fn serializes_errors_as_a_code_only_object() {
    let error = SecureStoreError {
        code: SecureStoreErrorCode::Failed,
    };
    assert_eq!(
        serde_json::to_string(&error).unwrap(),
        r#"{"code":"SECURE_STORE_FAILED"}"#
    );
}

/// Real OS keychain round trip under a test-only service name (`cargo test -- --ignored`;
/// needs a desktop session with a keychain, so it is not part of the default run or CI).
#[test]
#[ignore = "touches the OS keychain"]
fn round_trips_through_the_os_keychain() {
    let store = SecureStore::new(Box::new(KeyringVault::new("dev.core.desktop.cargo-test")));
    store.delete().unwrap();
    assert_eq!(store.get(), Ok(None));
    store.set(RECORD).unwrap();
    assert_eq!(store.get(), Ok(Some(RECORD.to_owned())));
    store.delete().unwrap();
    assert_eq!(store.get(), Ok(None));
}
