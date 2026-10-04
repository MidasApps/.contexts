import path from "node:path";
import { readE2eEnv } from "@core/e2e/e2e-env";
import { e2eMastraServer } from "@core/e2e/mastra-server";
import { e2eWebServer } from "@core/e2e/web-server";
import { defineConfig, devices } from "@playwright/test";
import { authFile } from "./e2e/web-test.ts";

// Run through root `pnpm test:e2e` (scripts/e2e.ts): it starts the e2e emulators and exports the
// env read here; turbo builds the web with the e2e public config before `next start`.
const env = readE2eEnv();
const isCi = process.env["CI"] !== undefined;
const owner = authFile("owner");
const CHAT_SPECS = /chat-[a-z-]+.spec.ts/;
// The SP5 console journeys (/admin and /settings areas) run once, on chromium, like the chat ones.
const CONSOLE_SPECS = /(admin|settings)-[a-z-]+\.spec\.ts/;
const SINGLE_BROWSER_SPECS = [CHAT_SPECS, CONSOLE_SPECS];

// Playwright's config loader requires a default export.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  // Four workers in CI, two locally: each cold page restores a session through `next start` and the
  // emulators, and more parallel browsers than that made those restores slower than the timeouts. A
  // developer machine also runs the agent runtime, the emulators and its own apps (follow-up #102).
  workers: isCi ? 4 : 2,
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
    {
      name: "chromium",
      testIgnore: SINGLE_BROWSER_SPECS,
      use: { ...devices["Desktop Chrome"], storageState: owner },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      testIgnore: SINGLE_BROWSER_SPECS,
      use: { ...devices["Desktop Firefox"], storageState: owner },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testIgnore: SINGLE_BROWSER_SPECS,
      use: { ...devices["Desktop Safari"], storageState: owner },
      dependencies: ["setup"],
    },
    {
      name: "mobile-chrome",
      testIgnore: SINGLE_BROWSER_SPECS,
      use: { ...devices["Pixel 7"], storageState: owner },
      dependencies: ["setup"],
    },
    // One at a time too: an eval or a chat turn of one journey held the single local agent runtime
    // and the next journey's Mastra-backed pages loaded past their timeouts; serially 53 of 53 pass.
    {
      name: "console",
      workers: 1,
      testMatch: CONSOLE_SPECS,
      use: { ...devices["Desktop Chrome"], storageState: owner },
      dependencies: ["setup"],
    },
    // The chat journeys (SP4) run once, on chromium: each one streams through the agent runtime,
    // and the browser matrix above already covers the shell they are mounted in. One at a time:
    // with two or four streams on one local runtime next to the browsers and emulators, some
    // turns never started streaming before their timeouts; serially all of them pass (follow-up #80).
    {
      name: "chat",
      workers: 1,
      testMatch: CHAT_SPECS,
      use: { ...devices["Desktop Chrome"], storageState: owner },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    e2eWebServer(env, { webAppDir: import.meta.dirname }),
    // Started by path (a command in its folder), never imported: apps stay apart.
    e2eMastraServer(env, { mastraAppDir: path.resolve(import.meta.dirname, "../mastra") }),
  ],
});
