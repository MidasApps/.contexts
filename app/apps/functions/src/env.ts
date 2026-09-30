import { loadFunctionsEnv } from "./functions-env.schema.ts";

/**
 * Validated env (contracts/secrets.md §5.4). The only reader of `process.env`
 * in this codebase; parsed when the entry loads, so an invalid env fails the
 * deploy analysis and the emulator on purpose. Values come from the Firebase
 * `.env.<projectId>` files in `apps/functions` (firebase.json `configDir`).
 */
export const env = loadFunctionsEnv(process.env);

/**
 * Raw `process.env`, for the Firebase Admin emulator guard only: firebase-admin reads
 * `*_EMULATOR_HOST` itself, so the guard inspects the same source (#12c).
 */
export const processEnvForFirebaseGuard: Record<string, string | undefined> = process.env;
