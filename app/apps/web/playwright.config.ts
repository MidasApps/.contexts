import { defineConfig, devices } from "@playwright/test";
import { readE2eEnv } from "@core/e2e/e2e-env";
import { e2eWebServer } from "@core/e2e/web-server";
import { authFile } from "./e2e/web-test.ts";

// Run through root `pnpm test:e2e` (scripts/e2e.ts): it starts the e2e emulators and exports the
// env read here; turbo builds the web with the e2e public config before `next start`.
const env = readE2eEnv();
const isCi = process.env["CI"] !== undefined;
const owner = authFile("owner");

// Playwright's config loader requires a default export.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  // Four workers everywhere: each cold page restores a session through `next start` and the
  // emulators, and more parallel browsers than that made those restores slower than the timeouts.
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCi ? [["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `${env.E2E_WEB_ORIGIN}/pt-BR/`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "on-first-retry",
    screenshot: env.E2E_SCREENSHOTS ? "on" : "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: owner }, dependencies: ["setup"] },
    { name: "firefox", use: { ...devices["Desktop Firefox"], storageState: owner }, dependencies: ["setup"] },
    { name: "webkit", use: { ...devices["Desktop Safari"], storageState: owner }, dependencies: ["setup"] },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], storageState: owner }, dependencies: ["setup"] },
  ],
  webServer: e2eWebServer(env, { webAppDir: import.meta.dirname }),
});
