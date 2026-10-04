import type { UsageReportPort } from "@core/agents";
import {
  type AuditWriter,
  type createPostgresClient,
  createPostgresUsageReportRepository,
  createPostgresUsageRepository,
  createUsageSink,
  type FirebaseAdmin,
  type Logger,
  listLiveOrganizationIds,
  makeReportTenantUsage,
  systemClock,
} from "@core/services";

export type UsageReportBindingEnv = {
  readonly USAGE_SINK: "none" | "bigquery";
  readonly BIGQUERY_DATASET_AI_OBSERVABILITY: string;
  readonly FIREBASE_PROJECT_ID: string;
};

/**
 * `UsageReportPort` (SP5 Task 6, decision 0039): live organizations from Firestore, and the
 * per-tenant report over the usage tables with the warehouse sink of `USAGE_SINK` (BigQuery
 * `ai_observability` outside local, a logging no-op in local) and the SP1 audit writer.
 */
export const bindUsageReportPort = (deps: {
  readonly env: UsageReportBindingEnv;
  readonly sql: ReturnType<typeof createPostgresClient>;
  readonly firestore: FirebaseAdmin["firestore"];
  readonly audit: AuditWriter;
  readonly logger: Logger;
}): UsageReportPort => {
  const sink = createUsageSink({
    kind: deps.env.USAGE_SINK,
    dataset: deps.env.BIGQUERY_DATASET_AI_OBSERVABILITY,
    projectId: deps.env.FIREBASE_PROJECT_ID,
    logger: deps.logger,
  });
  const report = makeReportTenantUsage({
    repository: createPostgresUsageRepository(deps.sql),
    reports: createPostgresUsageReportRepository(deps.sql),
    sink,
    audit: deps.audit,
    clock: systemClock,
  });
  return {
    listTenantIds: () => listLiveOrganizationIds(deps.firestore),
    reportTenant: (input) => report(input),
  };
};
