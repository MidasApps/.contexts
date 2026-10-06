"use client";

import type { LogLineLevel } from "@core/contracts";
import { useTranslations } from "use-intl";
import { LOG_LEVELS, LOG_LINES_LIMIT, type LogFilters, useAdminLogs } from "#/entities/log-line/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { isApiErrorStatus } from "#/shared/api/cursor-list.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { AdminPageFrame, AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { LogFiltersForm } from "./LogFiltersForm.tsx";
import { LogLines } from "./LogLines.tsx";

const CLOUD_LOGGING = "https://console.cloud.google.com/logs/query";
const isLevel = (value: string | undefined): value is LogLineLevel =>
  value !== undefined && (LOG_LEVELS as readonly string[]).includes(value);

/**
 * Cloud Logging query for the trace and request of the filter (rules/observability.md field
 * names). The client does not know the project id, so the link opens the console's project picker.
 */
export const cloudLoggingHref = (filters: Pick<LogFilters, "traceId" | "requestId">): string => {
  const clauses = [
    ...(filters.traceId === undefined ? [] : [`jsonPayload.traceId="${filters.traceId}"`]),
    ...(filters.requestId === undefined ? [] : [`jsonPayload.requestId="${filters.requestId}"`]),
  ];
  return clauses.length === 0 ? CLOUD_LOGGING : `${CLOUD_LOGGING};query=${encodeURIComponent(clauses.join("\n"))}`;
};

/** Outside the local environment the buffer does not exist (the API answers 404). */
function RemoteLogs({ filters }: { filters: LogFilters }) {
  const t = useTranslations("admin.logs.remote");
  const filtered = filters.traceId !== undefined || filters.requestId !== undefined;
  return (
    <StatePanel
      icon="scroll-text"
      title={t("title")}
      description={filtered ? t("descriptionFiltered") : t("description")}
      action={
        <Button variant="secondary" asChild>
          <a href={cloudLoggingHref(filters)} target="_blank" rel="noreferrer noopener">
            {t("open")}
            <Icon name="external-link" />
            <span className="sr-only">{t("newTab")}</span>
          </a>
        </Button>
      }
    />
  );
}

/**
 * `/admin/logs` (SP5 spec §6, platform.trace.read): in the local environment, the latest
 * structured log lines of the web process, filtered by minimum level, message text, trace and
 * request (all in the URL; the trace viewer links here with `?traceId=`), refreshed on demand.
 * Anywhere else the page points to Cloud Logging with the same trace and request.
 */
export function AdminLogsView() {
  const t = useTranslations("admin.logs");
  const permissions = usePlatformPermissions();
  const search = useAdminSearch(["level", "q", "traceId", "requestId"]);
  const filters: LogFilters = {
    level: isLevel(search.values.level) ? search.values.level : undefined,
    q: search.values.q,
    traceId: search.values.traceId,
    requestId: search.values.requestId,
  };
  const logs = useAdminLogs(filters, { enabled: permissions.can("platform.trace.read") });
  const remote = isApiErrorStatus(logs.error, 404);
  const filtering = Object.values(filters).some((value) => value !== undefined);
  const formKey = [search.values.q, search.values.traceId, search.values.requestId].join("|");
  return (
    <AdminPageFrame
      permission="platform.trace.read"
      title={t("title")}
      description={t("description")}
      actions={
        remote ? undefined : (
          <Button variant="secondary" onClick={() => void logs.refetch()} pending={logs.isFetching && !logs.isPending}>
            <Icon name="refresh" />
            {t("refresh")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <LogFiltersForm key={formKey} values={search.values} onChange={search.set} />
        {remote ? (
          <RemoteLogs filters={filters} />
        ) : (
          <AdminQuerySection query={logs} loadingLabel={t("loading")}>
            {(lines) =>
              lines.length === 0 ? (
                filtering ? (
                  <EmptyState
                    headingLevel={2}
                    icon="search"
                    title={t("noMatchTitle")}
                    description={t("noMatchDescription")}
                    action={
                      <Button
                        variant="secondary"
                        onClick={() =>
                          search.set({ level: undefined, q: undefined, traceId: undefined, requestId: undefined })
                        }
                      >
                        {t("clearFilters")}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    headingLevel={2}
                    icon="scroll-text"
                    title={t("emptyTitle")}
                    description={t("emptyDescription")}
                    action={
                      <Button variant="secondary" onClick={() => void logs.refetch()}>
                        {t("refresh")}
                      </Button>
                    }
                  />
                )
              ) : (
                <>
                  <p role="status" className="text-xs text-muted-foreground">
                    {t("count", { count: lines.length, limit: LOG_LINES_LIMIT })}
                  </p>
                  <LogLines lines={lines} />
                </>
              )
            }
          </AdminQuerySection>
        )}
      </div>
    </AdminPageFrame>
  );
}
