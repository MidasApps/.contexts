import type { PlaywrightTestConfig } from "@playwright/test";
import type { E2eEnv } from "./e2e-env.ts";

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, { command: string }>;

// The first boot creates Mastra's tables in the e2e database before it listens.
const START_TIMEOUT_MS = 180_000;

/**
 * The agent runtime of the chat journeys: the built Mastra server of `mastraAppDir` (apps/mastra;
 * turbo builds it first) with fake models (`AI_MODE=fake` of the e2e env), on `E2E_MASTRA_PORT`.
 * The web `/v1` gateway reaches it through `MASTRA_URL`. Reuse follows `E2E_REUSE_SERVERS`, like
 * the web server.
 */
export const e2eMastraServer = (env: E2eEnv, args: { mastraAppDir: string }): WebServer => ({
  command: "node .mastra/output/index.mjs",
  cwd: args.mastraAppDir,
  url: `${env.E2E_MASTRA_ORIGIN}/health`,
  // Mastra and Cloud Run read PORT; it is set here only, because `next start` reads it too.
  env: { PORT: String(env.E2E_MASTRA_PORT) },
  reuseExistingServer: env.E2E_REUSE_SERVERS,
  timeout: START_TIMEOUT_MS,
  stdout: "ignore",
  stderr: "pipe",
});
