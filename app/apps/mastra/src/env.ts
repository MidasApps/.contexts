import { loadMastraEnv } from "./mastra-env.schema.ts";

/**
 * Validated server env (contracts/secrets.md §5.4). The only reader of
 * `process.env` in this app; parsed once when the Mastra entry loads, so an
 * invalid env fails the boot on purpose.
 */
export const env = loadMastraEnv(process.env);

/**
 * The raw environment, only for `createFirebaseAdmin`'s guard: firebase-admin
 * reads `*_EMULATOR_HOST` itself, so the guard inspects the same source (SP1 spec §8, #12c).
 */
export const processEnvForFirebaseGuard: Record<string, string | undefined> = process.env;
