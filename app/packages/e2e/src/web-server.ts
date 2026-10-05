import type { PlaywrightTestConfig } from "@playwright/test";
import type { E2eEnv } from "./e2e-env.ts";

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, { command: string }>;

const START_TIMEOUT_MS = 120_000;

/**
 * `next start` of the e2e build in `webAppDir` (apps/web; turbo builds it first with the e2e
 * public config). Shared by the web config and the desktop-web config, which calls the same
 * `/v1`. A server already on the
 * port is reused only with `E2E_REUSE_SERVERS=1` (local iteration on an e2e server you started
 * yourself): by default it could be a dev server bound to other emulators, so the run fails.
 */
export const e2eWebServer = (env: E2eEnv, args: { webAppDir: string }): WebServer => ({
  // Run by node, not through `pnpm exec`: on Linux the server outlived Playwright's kill of the
  // wrapper and kept its stderr pipe open, so the run never ended after the last journey.
  command: `node node_modules/next/dist/bin/next start --port ${String(env.E2E_WEB_PORT)}`,
  cwd: args.webAppDir,
  url: `${env.E2E_WEB_ORIGIN}/v1/health`,
  reuseExistingServer: env.E2E_REUSE_SERVERS,
  timeout: START_TIMEOUT_MS,
  stdout: "ignore",
  stderr: "pipe",
});
