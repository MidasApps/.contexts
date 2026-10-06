//! Secure store of the desktop session (decision 0017 §1): one secret slot in the OS
//! keychain (Windows Credential Manager, macOS Keychain, Secret Service on Linux) through
//! the `keyring` crate. Service = the bundle identifier, account = `desktop-session`.
//!
//! The webview reaches it only through the `secure_store_get|set|delete` commands, granted
//! to the `main` window by `permissions/secure-store.toml`. Errors carry a stable code and
//! nothing else: the secret never appears in an error, a log line or a panic message.

use serde::Serialize;
use tauri::State;

/// Keychain account of the desktop session record.
pub const ACCOUNT: &str = "desktop-session";

/// Upper bound of a stored value. The webview stores a small JSON record (session id +
/// 43-char secret); anything bigger is a caller bug, and Credential Manager caps blobs
/// at 2560 bytes.
pub const MAX_SECRET_BYTES: usize = 1024;

/// Stable failure codes returned to the webview (mirrored by `SecureStoreErrorCode` in TS).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum SecureStoreErrorCode {
    /// No usable keychain (no Secret Service provider, locked or denied store).
    #[serde(rename = "SECURE_STORE_UNAVAILABLE")]
    Unavailable,
    /// The keychain answered with an unexpected failure.
    #[serde(rename = "SECURE_STORE_FAILED")]
    Failed,
    /// The value is empty, too long or not printable ASCII.
    #[serde(rename = "SECURE_STORE_INVALID_ARGUMENT")]
    InvalidArgument,
}

/// What a command rejects with: `{ "code": "SECURE_STORE_…" }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SecureStoreError {
    pub code: SecureStoreErrorCode,
}

impl SecureStoreError {
    const fn of(code: SecureStoreErrorCode) -> Self {
        Self { code }
    }
}

/// The keychain slot behind the store; a fake replaces it in unit tests.
pub trait Vault: Send + Sync {
    /// `Ok(None)` when no entry exists.
    fn read(&self) -> Result<Option<String>, SecureStoreErrorCode>;
    fn write(&self, value: &str) -> Result<(), SecureStoreErrorCode>;
    /// Idempotent: deleting a missing entry succeeds.
    fn remove(&self) -> Result<(), SecureStoreErrorCode>;
}

/// The OS keychain entry `(service, ACCOUNT)`.
pub struct KeyringVault {
    service: String,
}

impl KeyringVault {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, SecureStoreErrorCode> {
        keyring::Entry::new(&self.service, ACCOUNT).map_err(|error| map_keyring_error(&error))
    }
}

impl Vault for KeyringVault {
    fn read(&self) -> Result<Option<String>, SecureStoreErrorCode> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(map_keyring_error(&error)),
        }
    }

    fn write(&self, value: &str) -> Result<(), SecureStoreErrorCode> {
        self.entry()?
            .set_password(value)
            .map_err(|error| map_keyring_error(&error))
    }

    fn remove(&self) -> Result<(), SecureStoreErrorCode> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(map_keyring_error(&error)),
        }
    }
}

/// Keychain errors → stable codes. Only the variant is inspected: some variants carry
/// the stored bytes (`BadEncoding`), which must never leave this function.
pub fn map_keyring_error(error: &keyring::Error) -> SecureStoreErrorCode {
    match error {
        keyring::Error::NoDefaultStore
        | keyring::Error::NoStorageAccess(_)
        | keyring::Error::PlatformFailure(_) => SecureStoreErrorCode::Unavailable,
        keyring::Error::TooLong(..) | keyring::Error::Invalid(..) => {
            SecureStoreErrorCode::InvalidArgument
        }
        _ => SecureStoreErrorCode::Failed,
    }
}

/// Values the store accepts: 1..=MAX_SECRET_BYTES bytes of printable ASCII (JSON of
/// base64url and id characters), so no control character reaches the keychain.
pub fn validate_secret(value: &str) -> Result<(), SecureStoreErrorCode> {
    let printable = value.bytes().all(|byte| (0x20..=0x7e).contains(&byte));
    if value.is_empty() || value.len() > MAX_SECRET_BYTES || !printable {
        return Err(SecureStoreErrorCode::InvalidArgument);
    }
    Ok(())
}

/// Managed state of the commands.
pub struct SecureStore {
    vault: Box<dyn Vault>,
}

impl SecureStore {
    pub fn new(vault: Box<dyn Vault>) -> Self {
        Self { vault }
    }

    pub fn get(&self) -> Result<Option<String>, SecureStoreError> {
        self.vault.read().map_err(SecureStoreError::of)
    }

    pub fn set(&self, secret: &str) -> Result<(), SecureStoreError> {
        validate_secret(secret).map_err(SecureStoreError::of)?;
        self.vault.write(secret).map_err(SecureStoreError::of)
    }

    pub fn delete(&self) -> Result<(), SecureStoreError> {
        self.vault.remove().map_err(SecureStoreError::of)
    }
}

// `async`: keychain calls may block (Secret Service over D-Bus, macOS access prompts),
// so they run off the main thread.

#[tauri::command(async)]
pub fn secure_store_get(store: State<'_, SecureStore>) -> Result<Option<String>, SecureStoreError> {
    store.get()
}

#[tauri::command(async)]
pub fn secure_store_set(
    store: State<'_, SecureStore>,
    secret: String,
) -> Result<(), SecureStoreError> {
    store.set(&secret)
}

#[tauri::command(async)]
pub fn secure_store_delete(store: State<'_, SecureStore>) -> Result<(), SecureStoreError> {
    store.delete()
}

#[cfg(test)]
#[path = "secure_store_tests.rs"]
mod tests;
