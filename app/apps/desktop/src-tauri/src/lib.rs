//! Tauri shell. No plugins; the only app commands are the secure store ones
//! (`secure_store.rs`), granted to the `main` window by `capabilities/default.json`.
//! Every new native capability must be granted explicitly there.

mod secure_store;

use secure_store::{KeyringVault, SecureStore};
use tauri::Manager;

/// Starts the app; also the mobile entry point (Android/iOS) once those targets exist.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Keychain service = bundle identifier, so dev/staging/prod builds with distinct
            // identifiers never share a session record.
            let service = app.config().identifier.clone();
            app.manage(SecureStore::new(Box::new(KeyringVault::new(service))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod capability_tests {
    /// The main window gets the core defaults and the secure store set, nothing else.
    #[test]
    fn grants_only_the_secure_store_commands_to_the_main_window() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        assert_eq!(
            capability["permissions"],
            serde_json::json!(["core:default", "allow-secure-store"])
        );
        let permissions = include_str!("../permissions/secure-store.toml");
        for command in [
            "secure_store_get",
            "secure_store_set",
            "secure_store_delete",
        ] {
            assert!(
                permissions.contains(&format!("commands.allow = [\"{command}\"]")),
                "{command} has its own permission"
            );
        }
        assert_eq!(
            permissions.matches("commands.allow").count(),
            3,
            "no other command is allowed"
        );
    }
}
