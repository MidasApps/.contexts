import { AgentEnvSchema, resolveAgentEnv } from "@core/agents";
import { InvalidEnvError, loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/** Cloud Run caps a request at 60 min; a longer server timeout would never apply. */
const MAX_SERVER_TIMEOUT_MS = 3_600_000;
/** 15 min: well past Mastra's 180 s default, short enough to reap stuck streams. */
const DEFAULT_SERVER_TIMEOUT_MS = 900_000;
/** Local dev clients: web (`next dev`), desktop (Vite dev server, Tauri webview). */
const DEFAULT_LOCAL_CORS_ORIGINS = "http://localhost:3000,http://localhost:1420,tauri://localhost,http://tauri.localhost";

const OriginListSchema = z
  .string()
  .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
  .pipe(z.array(z.url()));

/** Variables only the Mastra server reads, on top of the services env. */
export const MastraOnlyEnvSchema = z.object({
  // Mastra binds `localhost` by default; containers must set 0.0.0.0 (spec §16.3).
  MASTRA_HOST: z.string().min(1).default("localhost"),
  // Same variable Mastra and Cloud Run use; 4111 is the `mastra dev` default.
  PORT: z.coerce.number().int().min(1).max(65_535).default(4111),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Mastra's default (180 s) cuts long agent streams (spec §16.3).
  MASTRA_SERVER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_SERVER_TIMEOUT_MS)
    .default(DEFAULT_SERVER_TIMEOUT_MS),
  // Extra browser origins allowed in local only (Studio's own origin is always
  // allowed there); outside local CORS is off and this list is ignored.
  // prefault: the default is parsed like any input (split, then validated).
  MASTRA_CORS_ORIGINS: OriginListSchema.prefault(DEFAULT_LOCAL_CORS_ORIGINS),
  // Cloud Storage bucket of uploads read by knowledge ingestion (SP3 files context);
  // local defaults to the emulator's default bucket, required outside local.
  FILES_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, { error: "expected a bucket name" }).optional(),
});

/** Mastra server variables plus the agent runtime env (spec §15, decision 0021). */
const MastraEnvSchema = MastraOnlyEnvSchema.extend(AgentEnvSchema.shape);

/**
 * Parses the Mastra server env once at boot (fail-fast by design), then applies
 * the agent rules that depend on APP_ENV and AI_MODE (fake only in local/dev,
 * provider keys in real mode, remote-only requirements).
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadMastraEnv = (source: Record<string, string | undefined>) => {
  const env = resolveAgentEnv(loadServicesEnvWith(MastraEnvSchema, source));
  if (env.FILES_BUCKET !== undefined) return { ...env, FILES_BUCKET: env.FILES_BUCKET };
  if (env.APP_ENV !== "local") throw new InvalidEnvError([{ field: "FILES_BUCKET", issue: "REQUIRED" }]);
  return { ...env, FILES_BUCKET: `${env.FIREBASE_PROJECT_ID}.appspot.com` };
};

export type MastraEnv = ReturnType<typeof loadMastraEnv>;
