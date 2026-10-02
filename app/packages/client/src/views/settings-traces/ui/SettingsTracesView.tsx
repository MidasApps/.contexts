"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { TraceStatusPill, useTenantTrace } from "#/entities/trace/index.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame, SettingsSectionLink } from "#/widgets/settings-nav/index.ts";
import { TraceDetail } from "./TraceDetail.tsx";
import { TraceList } from "./TraceList.tsx";

const READ = "core.trace.read";

/** W3C trace id (`TraceIdSchema`): anything else in the path is not a trace. */
const TRACE_ID = /^[0-9a-f]{32}$/u;

function BackToTraces({ organizationId }: { organizationId: string }) {
  const t = useTranslations("settings.traces.detail");
  return (
    <Button variant="secondary" asChild>
      <SettingsSectionLink organizationId={organizationId} section="traces">
        <Icon name="arrow-left" />
        {t("back")}
      </SettingsSectionLink>
    </Button>
  );
}

function TracesPage({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.traces");
  const { organization } = context;
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes(READ)}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} description={t("description")} />}
    >
      <TraceList organization={organization} />
    </SettingsPageFrame>
  );
}

function TraceDetailPage({ context, traceId }: { context: AccessContext; traceId: string }) {
  const t = useTranslations("settings.traces");
  const { organization } = context;
  const allowed = context.permissions.includes(READ);
  const valid = TRACE_ID.test(traceId);
  const trace = useTenantTrace(organization.id, traceId, { enabled: allowed && valid });
  // Another organization's trace answers 404 too: the page never says which case it was.
  const missing = !valid || isApiErrorStatus(trace.error, 404);
  return (
    <SettingsPageFrame width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={trace.data?.summary.name ?? t("detail.title")}
          meta={trace.data === undefined ? undefined : <TraceStatusPill status={trace.data.summary.status} />}
          actions={<BackToTraces organizationId={organization.id} />}
        />
      }
    >
      {missing ? (
        <EmptyState frame="plain" headingLevel={2} icon="search" title={t("detail.notFoundTitle")} description={t("detail.notFoundDescription")} />
      ) : (
        <QuerySection query={trace} loadingLabel={t("detail.loading")}>
          {(detail) => <TraceDetail detail={detail} />}
        </QuerySection>
      )}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/traces` and `…/traces/:traceId` (SP5 spec §7, core.trace.read):
 * the organization's own agent and workflow runs, and one run's span tree. The API forces the
 * tenant; the page also sends the organization and keys its cache by it.
 */
export function SettingsTracesView() {
  const t = useTranslations("settings.traces");
  const node = useCurrentNode();
  const rest = useRouter().useRouteParams()["rest"];
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => (rest === undefined || rest === "" ? <TracesPage context={data} /> : <TraceDetailPage context={data} traceId={rest} />)}
    </QueryPage>
  );
}
