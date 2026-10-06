import { configureProcessLogger } from "@core/services";
import type { MastraEnv } from "../mastra-env.schema.ts";
import { MASTRA_SERVICE_NAME } from "./mastra-options.ts";

/**
 * Boot hook for the shared `@core/services` process logger (decision
 * app/docs/decisions/0002): driving adapters reused by Mastra log with
 * `service: "mastra"` and the validated `APP_ENV`.
 */
export const configureMastraProcessLogger = (env: MastraEnv): void => {
  configureProcessLogger({ service: MASTRA_SERVICE_NAME, env: env.APP_ENV });
};
