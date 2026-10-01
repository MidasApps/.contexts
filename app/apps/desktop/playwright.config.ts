import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { readE2eEnv } from "@core/e2e/e2e-env";
import { e2eWebServer } from "@core/e2e/web-server";

// Project `desktop-web` (SP2 spec §13 item 7): the desktop frontend built by Vite with the e2e
// public config (turbo builds it, and the web, before this runs) and served by `vite preview`,
// against the same e2e `/v1` as the web journeys. Run through root `pnpm test:e2e`, which starts
// the emulators and exports the env read here. The native Tauri shell is Task 24's smoke test.
const env = readE2eEnv();
const isCi = process.env["CI"] !== undefined;

// Playwright's config loader requires a default export.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  // Same cap as the web config: the journeys share one `next start` and the emulators.
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCi ? [["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: env.E2E_DESKTOP_ORIGIN,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "on-first-retry",
    screenshot: env.E2E_SCREENSHOTS ? "on" : "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "desktop-web", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: [
    // The web app is started by path (a command in its folder), never imported: apps stay apart.
    e2eWebServer(env, { webAppDir: path.resolve(import.meta.dirname, "../web") }),
    {
      command: `pnpm exec vite preview --port ${String(env.E2E_DESKTOP_PORT)} --strictPort`,
      cwd: path.resolve(import.meta.dirname),
      url: env.E2E_DESKTOP_ORIGIN,
      reuseExistingServer: env.E2E_REUSE_SERVERS,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
