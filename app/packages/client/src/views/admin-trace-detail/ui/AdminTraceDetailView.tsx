"use client";

import type { TraceDetail } from "@core/contracts";
import { useFormatter, useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { TraceCost, TraceDuration, TraceStatusPill, useAdminTrace } from "#/entities/trace/index.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { KpiCard } from "#/widgets/admin-kpi-cards/index.ts";
import { AdminPageFrame, AdminQuerySection } from "#/widgets/admin-nav/index.ts";
import { PageNotFound } from "#/widgets/page-state/index.ts";
import { TraceViewer } from "#/widgets/trace-viewer/index.ts";

/** W3C trace id (`TraceIdSchema`): anything else in the path is not a trace. */
const TRACE_ID = /^[0-9a-f]{32}$/u;

function TraceSummaryCards({ detail, organizationName }: { detail: TraceDetail; organizationName: string }) {
  const t = useTranslations("admin.traces");
  const format = useFormatter();
  const formatDateTime = useFormatDateTime();
  const { summary } = detail;
  const target = summary.agentId !== null ? t("agentTarget", { id: summary.agentId }) : summary.workflowId !== null ? t("workflowTarget", { id: summary.workflowId }) : t("noTarget");
  return (
    <section aria-labelledby="trace-summary-title" className="flex flex-col gap-3">
      <h2 id="trace-summary-title" className="text-sm font-medium text-muted-foreground">
        {t("detail.summary")}
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("detail.organization")} value={<span className="font-sans text-base break-words">{organizationName}</span>} hint={target} />
        <KpiCard label={t("detail.startedAt")} value={<span className="text-base">{formatDateTime(summary.startedAt)}</span>} />
        <KpiCard label={t("detail.duration")} value={<TraceDuration durationMs={summary.durationMs} />} />
        <KpiCard label={t("detail.tokens")} value={t("tokensValue", { input: format.number(summary.inputTokens), output: format.number(summary.outputTokens) })} />
        <KpiCard label={t("detail.cost")} value={<TraceCost costMicroUsd={summary.costMicroUsd} />} />
        <KpiCard label={t("detail.traceId")} value={<span className="text-xs font-normal break-all">{summary.traceId}</span>} />
      </dl>
    </section>
  );
}

/**
 * `/admin/traces/:traceId` (SP5 spec §6, platform.trace.read): the trace's numbers and its span
 * tree with tokens and cost per span and redacted input and output, plus a link to its logs. A
 * trace that does not exist (or an id that is not a trace id) is the not-found page.
 */
export function AdminTraceDetailView() {
  const t = useTranslations("admin.traces");
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  const traceId = rest.split("/")[1] ?? "";
  const valid = TRACE_ID.test(traceId);
  const permissions = usePlatformPermissions();
  const allowed = permissions.can("platform.trace.read");
  const trace = useAdminTrace(traceId, { enabled: valid && allowed });
  const organizations = useAllAdminOrganizations({ enabled: valid && allowed && permissions.can("platform.organization.read") });
  if (!valid || isApiErrorStatus(trace.error, 404)) return <PageNotFound />;
  const tenantId = trace.data?.summary.tenantId;
  const organizationName = tenantId === null || tenantId === undefined ? t("platform") : (organizations.data?.find((organization) => organization.id === tenantId)?.name ?? tenantId);
  return (
    <AdminPageFrame
      permission="platform.trace.read"
      title={trace.data?.summary.name ?? t("detail.title")}
      back={{ rest: "traces", label: t("detail.back") }}
      meta={trace.data === undefined ? undefined : <TraceStatusPill status={trace.data.summary.status} />}
    >
      <AdminQuerySection query={trace} loadingLabel={t("detail.loading")}>
        {(detail) => (
          <div className="flex flex-col gap-8">
            <TraceSummaryCards detail={detail} organizationName={organizationName} />
            <TraceViewer detail={detail} logsRoute={{ id: "admin", rest: "logs", search: { traceId: detail.summary.traceId } }} />
          </div>
        )}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}
