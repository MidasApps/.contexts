// Release builds on Windows must not open an extra console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    core_desktop_lib::run()
}
