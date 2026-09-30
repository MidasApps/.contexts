import "server-only";
import {
  buildConnectorsRoutes,
  buildFilesRoutes,
  buildKnowledgeDocumentsRoutes,
  buildKnowledgeSourcesRoutes,
  createFirebaseAdmin,
  createFirebaseConnectorsServices,
  createFirebaseFilesServices,
  createKnowledgeServices,
  createMastraGateway,
  createPostgresClient,
  createPostgresKnowledgeRepository,
  createServerlessIdTokenSource,
  processLogger,
} from "@core/services";
import type { CoreRoutes, CoreServer } from "@core/services/composition";

// The model id only matters for search, which runs in Mastra; the web routes list, read and delete.
const UNUSED_SEARCH_MODEL = "web/no-search";

/**
 * `/v1` routes of the SP3 contexts that `createCoreServer` does not build: files (uploads,
 * SP3 Task 13), the knowledge base (documents over Postgres, sources through the Mastra
 * gateway, Task 14) and tenant connectors (Firestore + secret store, Task 21). They share
 * the core server's pipeline, audit writer and Admin SDK app.
 */
export const buildRuntimeRoutes = async (core: CoreServer): Promise<CoreRoutes> => {
  const { env, processEnvForFirebaseGuard } = await import("@/env");
  const firebase = createFirebaseAdmin({ env, processEnv: processEnvForFirebaseGuard });
  const files = createFirebaseFilesServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FILES_BUCKET: env.FILES_BUCKET, FIREBASE_STORAGE_EMULATOR_HOST: env.FIREBASE_STORAGE_EMULATOR_HOST },
    logger: processLogger,
  });
  // postgres.js connects lazily; the web login role may SET ROLE knowledge_runtime (migration 0005).
  const knowledge = createKnowledgeServices({
    repository: createPostgresKnowledgeRepository(createPostgresClient({ DATABASE_URL: env.DATABASE_URL })),
    embeddingModel: UNUSED_SEARCH_MODEL,
  });
  const gateway = createMastraGateway({
    baseUrl: env.MASTRA_URL,
    serverlessToken: env.APP_ENV === "local" || env.MASTRA_AUDIENCE === undefined ? null : createServerlessIdTokenSource({ audience: env.MASTRA_AUDIENCE }),
  });
  const connectors = createFirebaseConnectorsServices({
    firebase,
    env: { APP_ENV: env.APP_ENV, FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID },
    audit: core.audit,
    clock: core.pipeline.clock,
  });
  return {
    ...buildConnectorsRoutes({ pipeline: core.pipeline, connectors }),
    ...buildFilesRoutes({ pipeline: core.pipeline, files }),
    ...buildKnowledgeDocumentsRoutes({ pipeline: core.pipeline, knowledge }),
    ...buildKnowledgeSourcesRoutes({ pipeline: core.pipeline, gateway, getReadyFile: files.getReadyFile, resolveAccessContext: core.resolveAccessContext }),
  };
};
