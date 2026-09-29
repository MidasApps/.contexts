import { configureProcessLogger } from "@core/services";

/**
 * Runs once per server start, before the first request: validates the env
 * (fail-fast, contracts/secrets.md §5.4) and sets the logger's base fields.
 * The env is imported here, not at module scope, so `next build` does not
 * need runtime variables.
 */
export const register = async (): Promise<void> => {
  const { env } = await import("./env");
  configureProcessLogger({ service: "web", env: env.APP_ENV });
};
