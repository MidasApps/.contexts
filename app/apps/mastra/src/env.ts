import { loadMastraEnv } from "./mastra-env.schema.ts";

/**
 * Validated server env (contracts/secrets.md §5.4). The only reader of
 * `process.env` in this app; parsed once when the Mastra entry loads, so an
 * invalid env fails the boot on purpose.
 */
export const env = loadMastraEnv(process.env);
