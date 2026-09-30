import "server-only";
import { buildFilesRoutes, createFirebaseAdmin, createFirebaseFilesServices, processLogger } from "@core/services";
import type { CoreRoutes, CoreServer } from "@core/services/composition";

/**
 * `/v1` routes of the SP3 contexts that `createCoreServer` does not build: files
 * (uploads, SP3 Task 13). They share the core server's pipeline (auth, validation,
 * rate limits, idempotency) and Admin SDK app.
 */
export const buildRuntimeRoutes = async (core: CoreServer): Promise<CoreRoutes> => {
  const { env, processEnvForFirebaseGuard } = await import("@/env");
  const firebase = createFirebaseAdmin({ env, processEnv: processEnvForFirebaseGuard });
  const files = createFirebaseFilesServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FILES_BUCKET: env.FILES_BUCKET, FIREBASE_STORAGE_EMULATOR_HOST: env.FIREBASE_STORAGE_EMULATOR_HOST },
    logger: processLogger,
  });
  return { ...buildFilesRoutes({ pipeline: core.pipeline, files }) };
};
