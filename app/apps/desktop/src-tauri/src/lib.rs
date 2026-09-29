//! Tauri shell: no custom commands and no plugins yet. Native capabilities
//! (secure token storage, notifications, deep links) arrive with their spikes
//! and must be granted explicitly in `capabilities/`.

/// Starts the app; also the mobile entry point (Android/iOS) once those targets exist.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
