// Writes src-tauri/tauri.api.conf.json (gitignored) so the webview CSP allows
// exactly the API origin the bundle calls. Usage: node scripts/write-tauri-api-config.ts [mode]
// `mode` is the Vite mode (default: production); VITE_API_URL resolves exactly as
// Vite resolves it for that mode (shell env > .env.[mode].local > .env.[mode] > .env).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadDesktopBuildEnv } from "./load-desktop-build-env.ts";
import { buildTauriApiConfigPatch } from "./tauri-api-config.ts";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const OUTPUT_FILE = path.join(APP_DIR, "src-tauri", "tauri.api.conf.json");

const mode = process.argv[2] ?? "production";
const env = loadDesktopBuildEnv({ mode, envDir: APP_DIR });
const patch = buildTauriApiConfigPatch({ apiUrl: env.VITE_API_URL, authEmulatorUrl: env.VITE_AUTH_EMULATOR_URL });

writeFileSync(OUTPUT_FILE, `${JSON.stringify(patch, null, 2)}\n`);
process.stdout.write(`tauri api config (${mode}): connect-src ${patch.app.security.csp["connect-src"]}\n`);
