import { loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/** Cloud Run caps a request at 60 min; a longer server timeout would never apply. */
const MAX_SERVER_TIMEOUT_MS = 3_600_000;

/** Variables only the Mastra server reads, on top of the services env. */
export const MastraOnlyEnvSchema = z.object({
  // Mastra binds `localhost` by default; containers must set 0.0.0.0 (spec §16.3).
  MASTRA_HOST: z.string().min(1).default("localhost"),
  // Same variable Mastra and Cloud Run use; 4111 is the `mastra dev` default.
  PORT: z.coerce.number().int().min(1).max(65_535).default(4111),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Mastra's default (180 s) cuts long agent streams (spec §16.3).
  MASTRA_SERVER_TIMEOUT_MS: z.coerce.number().int().positive().max(MAX_SERVER_TIMEOUT_MS).default(MAX_SERVER_TIMEOUT_MS),
});

/**
 * Parses the Mastra server env once at boot (fail-fast by design).
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadMastraEnv = (source: Record<string, string | undefined>) =>
  loadServicesEnvWith(MastraOnlyEnvSchema, source);

export type MastraEnv = ReturnType<typeof loadMastraEnv>;
