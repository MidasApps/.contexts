import path from "node:path";

// Native desktop smoke (decision 0017 §4, SP2 spec §13 item 8): WebdriverIO + @wdio/tauri-service
// drive the real Tauri window of a debug build. Local only (`pnpm -F @core/desktop test:native`),
// never part of `pnpm test` or turbo `test:e2e`. Run it inside the e2e stack after seeding, see
// README "Native smoke test". The build must embed the e2e config (`tauri build --debug`).
const APP_DIR = path.resolve(import.meta.dirname, "..");
const binary = process.platform === "win32" ? "core-desktop.exe" : "core-desktop";
const application = process.env["TAURI_APP_PATH"] ?? path.join(APP_DIR, "src-tauri", "target", "debug", binary);
// A tauri-driver you installed (`cargo install --locked tauri-driver`); without it the service
// installs one with cargo.
const tauriDriverPath = process.env["TAURI_DRIVER_PATH"];

// WebdriverIO's config loader reads the named `config` export.
export const config: WebdriverIO.Config = {
  runner: "local",
  specs: [path.join(import.meta.dirname, "*.e2e.ts")],
  maxInstances: 1,
  // The binary goes in the service's `appBinaryPath` (typed; `tauri:options` has no typings).
  capabilities: [{ browserName: "tauri" }],
  // `external`: a separate tauri-driver (+ Edge WebDriver on Windows, managed by the service), so
  // the app needs no test-only plugin compiled in.
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: application,
        driverProvider: "external",
        ...(tauriDriverPath === undefined ? { autoInstallTauriDriver: true } : { tauriDriverPath }),
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  waitforTimeout: 30_000,
  // Generous: without the optional tauri-plugin-wdio in the app, the service's window-focus probe
  // before each element command waits for its own timeout (seconds per command).
  mochaOpts: { ui: "bdd", timeout: 600_000 },
};
