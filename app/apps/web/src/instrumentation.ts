/**
 * Runs once per server start, before the first request: validates the env
 * (fail-fast, contracts/secrets.md §5.4) and sets the logger's base fields.
 *
 * Next compiles this file for the Edge runtime too. `@core/services` loads Node built-ins
 * (`node:crypto`), so it is imported only in the Node runtime: a static import made every
 * `next build` print "Ecmascript file had an error" for each `node:crypto` user it reached
 * (Edge Instrumentation import trace). The env is imported here, not at module scope, so
 * `next build` does not need runtime variables.
 */
export const register = async (): Promise<void> => {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const [{ env }, { configureProcessLogger }] = await Promise.all([import("./env"), import("@core/services")]);
  configureProcessLogger({ service: "web", env: env.APP_ENV });
};
