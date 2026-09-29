import "server-only";
import { loadWebEnv } from "./web-env.schema";

/**
 * Validated server env (contracts/secrets.md §5.4). The only reader of
 * `process.env` in this app; parsed once, and an invalid env fails the boot
 * on purpose (`src/instrumentation.ts` imports it before the first request).
 */
export const env = loadWebEnv(process.env);
