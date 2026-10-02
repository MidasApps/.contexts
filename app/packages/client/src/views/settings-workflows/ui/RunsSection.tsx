"use client";

import { WORKFLOW_RUN_STATUSES, type AccessContext, type WorkflowCatalogEntry, type WorkflowRun, type WorkflowRunStatus } from "@core/contracts";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { isRunCancelable, RunStatusPill, TENANT_RUNS_PAGE_LIMIT, useTenantWorkflowRuns, type TenantRunFilters } from "#/entities/workflow-run/index.ts";
import { CancelWorkflowRunDialog } from "#/features/cancel-workflow-run/index.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { useStarterNames } from "../model/use-starter-names.ts";
import { useTenantScheduleLabels } from "../model/use-tenant-schedule-labels.ts";

const ANY = "any";
const isStatus = (value: string): value is WorkflowRunStatus => (WORKFLOW_RUN_STATUSES as readonly string[]).includes(value);
const column = dataTableColumnHelper<WorkflowRun>();

type RowActions = { organizationId: string; onCancel: ((run: WorkflowRun) => void) | null };
type StarterName = (uid: string | null) => string | undefined;
type ScheduleLabel = (scheduleId: string) => string | undefined;
type Labels = { starterName: StarterName; scheduleLabel: ScheduleLabel };

function RunName({ run }: { run: WorkflowRun }) {
  const workflowLabel = useWorkflowLabel();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{workflowLabel.name(run.workflowId)}</span>
      <span className="font-mono text-[11.5px] break-all text-muted-foreground">{run.runId}</span>
    </span>
  );
}

/** Who or what started the run, and whether it waits for an approval. */
function Origin({ run, labels }: { run: WorkflowRun; labels: Labels }) {
  const t = useTranslations("settings.workflows.runs");
  const tTimeline = useTranslations("common.runTimeline");
  const { starterName, scheduleLabel } = labels;
  const schedule = run.scheduleId === null ? undefined : scheduleLabel(run.scheduleId);
  const bySchedule = schedule === undefined ? tTimeline("startedByAnySchedule") : tTimeline("startedBySchedule", { schedule });
  const origin = run.scheduleId !== null ? bySchedule : run.startedBy !== null ? tTimeline("startedByUser", { user: starterName(run.startedBy) ?? run.startedBy }) : tTimeline("startedByPlatform");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="break-all">{origin}</span>
      {run.approvalRequestId === null || run.status !== "suspended" ? null : <span className="text-[11.5px] text-muted-foreground">{t("waitsApproval")}</span>}
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return useFormatDateTime()(iso);
}

function RunActions({ run, organizationId, onCancel }: RowActions & { run: WorkflowRun }) {
  const t = useTranslations("settings.workflows.runs");
  const workflow = useWorkflowLabel().name(run.workflowId);
  return (
    <span className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" asChild>
        <RouteLink to={{ id: "settings", organizationId, section: "workflows", rest: `runs/${run.runId}` }} aria-label={t("openNamed", { workflow, id: run.runId })}>
          {t("open")}
        </RouteLink>
      </Button>
      {onCancel !== null && isRunCancelable(run.status) ? (
        <Button variant="outline" size="sm" onClick={() => onCancel(run)} aria-label={t("cancelNamed", { workflow, id: run.runId })}>
          {t("cancel")}
        </Button>
      ) : null}
    </span>
  );
}

const useColumns = ({ organizationId, onCancel }: RowActions, labels: Labels) => {
  const t = useTranslations("settings.workflows.runs");
  return useMemo(
    () => [
      column.display({ id: "run", header: () => t("columns.run"), cell: ({ row }) => <RunName run={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <RunStatusPill status={getValue()} /> }),
      column.display({ id: "origin", header: () => t("columns.origin"), cell: ({ row }) => <Origin run={row.original} labels={labels} /> }),
      column.accessor("createdAt", { header: () => t("columns.createdAt"), cell: ({ getValue }) => <When iso={getValue()} /> }),
      column.accessor("updatedAt", { header: () => t("columns.updatedAt"), cell: ({ getValue }) => <When iso={getValue()} /> }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <RunActions run={row.original} organizationId={organizationId} onCancel={onCancel} /> }),
    ],
    [t, organizationId, onCancel, labels],
  );
};

function RunFilters({ filters, onChange, workflows }: { filters: TenantRunFilters; onChange: (filters: TenantRunFilters) => void; workflows: readonly WorkflowCatalogEntry[] }) {
  const t = useTranslations("settings.workflows.runs.filters");
  const workflowLabel = useWorkflowLabel();
  const tStatus = useTranslations("common.runTimeline.status");
  const workflowId = useId();
  const statusId = useId();
  return (
    <div role="search" aria-label={t("label")} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={workflowId}>{t("workflow")}</Label>
        <Select value={filters.workflowId ?? ANY} onValueChange={(value) => onChange({ ...filters, workflowId: value === ANY ? undefined : value })}>
          <SelectTrigger id={workflowId} className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("anyWorkflow")}</SelectItem>
            {workflows.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflowLabel.name(workflow.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={statusId}>{t("status")}</Label>
        <Select value={filters.status ?? ANY} onValueChange={(value) => onChange({ ...filters, status: isStatus(value) ? value : undefined })}>
          <SelectTrigger id={statusId} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("anyStatus")}</SelectItem>
            {WORKFLOW_RUN_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {tStatus(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export type RunsSectionProps = {
  context: AccessContext;
  /** Catalog entries for the workflow filter; empty while the catalog loads or when it failed. */
  workflows: readonly WorkflowCatalogEntry[];
  /** Opens the start dialog; `null` when the viewer may not start a run (or is offline). */
  onStart: (() => void) | null;
  online: boolean;
};

/**
 * Runs of the organization (core.workflow-run.read): filtered by workflow and status on the
 * server, paged by cursor, each with a link to its page and, for holders of
 * core.workflow-run.cancel, a cancel while the run is alive. Phones get cards.
 */
export function RunsSection({ context, workflows, onStart, online }: RunsSectionProps) {
  const t = useTranslations("settings.workflows.runs");
  const formatDateTime = useFormatDateTime();
  const { organization } = context;
  const [filters, setFilters] = useState<TenantRunFilters>({});
  const [canceling, setCanceling] = useState<WorkflowRun | null>(null);
  const runs = useTenantWorkflowRuns(organization.id, filters);
  const paged = useCursorPages(runs, TENANT_RUNS_PAGE_LIMIT, t("pagination"));
  const canCancel = context.permissions.includes("core.workflow-run.cancel") && online;
  const actions: RowActions = { organizationId: organization.id, onCancel: canCancel ? setCanceling : null };
  const starterName = useStarterNames({ organizationId: organization.id, canReadMembers: context.permissions.includes("core.member.read") });
  const scheduleLabel = useTenantScheduleLabels(context);
  const labels = useMemo((): Labels => ({ starterName, scheduleLabel }), [starterName, scheduleLabel]);
  const columns = useColumns(actions, labels);
  const filtering = filters.workflowId !== undefined || filters.status !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <RunFilters filters={filters} onChange={setFilters} workflows={workflows} />
      <QuerySection query={runs} loadingLabel={t("loading")}>
        {() => (
          <DataTable
            caption={t("caption", { organization: organization.name })}
            captionHidden
            columns={columns}
            data={paged.rows}
            getRowId={(run) => run.runId}
            pagination={paged.pagination}
            stateHeadingLevel={2}
            renderCard={(run) => (
              <div className="flex flex-col gap-2">
                <span className="flex items-start justify-between gap-2">
                  <RunName run={run} />
                  <RunStatusPill status={run.status} />
                </span>
                <span className="text-xs text-muted-foreground">
                  <Origin run={run} labels={labels} />
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</span>
                <span className="self-start">
                  <RunActions run={run} {...actions} />
                </span>
              </div>
            )}
            empty={
              filtering ? (
                <EmptyState frame="plain" headingLevel={2} icon="search" title={t("noMatchTitle")} description={t("noMatchDescription")} action={<Button variant="secondary" onClick={() => setFilters({})}>{t("clearFilters")}</Button>} />
              ) : (
                <EmptyState frame="plain" headingLevel={2} icon="workflow" title={t("emptyTitle")} description={onStart === null ? t("emptyDescription") : t("emptyDescriptionCanStart")} action={onStart === null ? undefined : <Button onClick={onStart}>{t("start")}</Button>} />
              )
            }
          />
        )}
      </QuerySection>
      <CancelWorkflowRunDialog organizationId={organization.id} run={canceling} onOpenChange={(open) => !open && setCanceling(null)} />
    </div>
  );
}
