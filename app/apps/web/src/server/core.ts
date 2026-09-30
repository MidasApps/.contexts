import "server-only";
import { createFirebaseAdmin, processLogger } from "@core/services";
import { createCoreServer, createRouteResolver, type CoreServer } from "@core/services/composition";
import { serverModules } from "./modules";

let coreServer: Promise<CoreServer> | undefined;

// The env is imported on first use, not at module scope, so `next build` can load route
// modules without runtime variables (same reason as `src/instrumentation.ts`).
const buildCoreServer = async (): Promise<CoreServer> => {
  const { env, processEnvForFirebaseGuard } = await import("@/env");
  return createCoreServer({
    env,
    firebase: createFirebaseAdmin({ env, processEnv: processEnvForFirebaseGuard }),
    logger: processLogger,
    modules: serverModules,
  });
};

/** The process-wide core server, built once on first use; a failed build is retried on the next call. */
export const getCoreServer = (): Promise<CoreServer> => {
  coreServer ??= buildCoreServer().catch((err: unknown) => {
    coreServer = undefined;
    throw err;
  });
  return coreServer;
};

/**
 * Route file entry point: `export const GET = route("identity.getMe");`. The id is
 * checked when the route module loads; the handler is resolved on the first request.
 */
export const route = createRouteResolver({ getRoutes: async () => (await getCoreServer()).routes, logger: processLogger });
