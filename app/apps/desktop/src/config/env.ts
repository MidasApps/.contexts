import { loadDesktopEnv } from "./desktop-env.schema.ts";

/**
 * Validated client env, parsed once at startup (fail-fast). The only reader of
 * `import.meta.env` in this app; values are public by contract.
 */
export const env = loadDesktopEnv(import.meta.env);
