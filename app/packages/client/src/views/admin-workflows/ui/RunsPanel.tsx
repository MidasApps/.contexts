"use client";

import { type AdminWorkflowRun, WORKFLOW_RUN_STATUSES, type WorkflowRunStatus } from "@core/contracts";
import { type FormEvent, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { useAdminUserNames } from "#/entities/admin-user/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { useAdminSchedules } from "#/entities/schedule/index.ts";
import { ADMIN_RUNS_PAGE_LIMIT, useAdminWorkflowRuns } from "#/entities/workflow-run/index.ts";
import { CancelRunDialog } from "#/features/admin-cancel-run/index.ts";
import { useScheduleLabels } from "#/features/schedule-editor/index.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { AdminOrganizationFilter, AdminQuerySection } from "#/widgets/admin-nav/index.ts";
import { RunTimeline } from "#/widgets/run-timeline/index.ts";
import { RunsTable } from "./RunsTable.tsx";

const ANY = "any";
/** Same shape as the contract's workflow id: a hand-typed value that cannot match is not sent. */
export const WORKFLOW_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const isStatus = (value: string | undefined): value is WorkflowRunStatus =>
  value !== undefined && (WORKFLOW_RUN_STATUSES as readonly string[]).includes(value);

export type RunFilterValues = {
  organizationId: string | undefined;
  workflowId: string | undefined;
  status: string | undefined;
};
type FilterPatch = Partial<RunFilterValues>;

function WorkflowIdField({
  value,
  onApply,
}: {
  value: string | undefined;
  onApply: (workflowId: string | undefined) => void;
}) {
  const t = useTranslations("admin.workflows.runs.filters");
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const invalid = draft !== "" && !WORKFLOW_ID.test(draft);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!invalid) onApply(draft === "" ? undefined : draft);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("workflow")}</Label>
      <span className="flex gap-2">
        <Input
          id={id}
          className="w-full sm:w-48"
          value={draft}
          onChange={(event) => setDraft(event.target.value.trim())}
          placeholder={t("workflowPlaceholder")}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
        <Button type="submit" variant="secondary">
          {t("apply")}
        </Button>
      </span>
      {invalid ? (
        <span id={`${id}-error`} className="text-xs font-medium text-destructive-text">
          {t("workflowInvalid")}
        </span>
      ) : null}
    </form>
  );
}

function RunFilters({ values, onChange }: { values: RunFilterValues; onChange: (patch: FilterPatch) => void }) {
  const t = useTranslations("admin.workflows.runs.filters");
  const tStatus = useTranslations("common.runTimeline.status");
  const statusId = useId();
  const suspendedOnly = values.status === "suspended";
  return (
    <div role="search" aria-label={t("label")} className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <AdminOrganizationFilter
        value={values.organizationId}
        onValueChange={(organizationId) => onChange({ organizationId })}
      />
      <WorkflowIdField
        key={values.workflowId ?? ""}
        value={values.workflowId}
        onApply={(workflowId) => onChange({ workflowId })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={statusId}>{t("status")}</Label>
        <Select
          value={values.status ?? ANY}
          onValueChange={(value) => onChange({ status: value === ANY ? undefined : value })}
        >
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
      <Button
        variant={suspendedOnly ? "default" : "secondary"}
        aria-pressed={suspendedOnly}
        onClick={() => onChange({ status: suspendedOnly ? undefined : "suspended" })}
      >
        {t("suspendedOnly")}
      </Button>
    </div>
  );
}

type RunLabels = {
  organizationLabel: (tenantId: string | null) => string;
  userLabel: (userId: string) => string;
  scheduleLabel: (scheduleId: string) => string | undefined;
};

/**
 * The run of `?run=`: found among the loaded rows, its timeline; while the list
 * loads or fails, nothing yet; not among them (another page, other filters, or gone), a dialog that says so
 * instead of an empty one. There is no endpoint for one run by id (follow-up 96).
 */
function RunDetailsDialog({
  runId,
  run,
  ready,
  labels,
  onClose,
}: {
  runId: string | undefined;
  run: AdminWorkflowRun | undefined;
  ready: boolean;
  labels: RunLabels;
  onClose: () => void;
}) {
  const t = useTranslations("admin.workflows.runs");
  const workflowLabel = useWorkflowLabel();
  // Only once the list loaded: while it loads or fails, the page shows its own loading or retry.
  const open = runId !== undefined && ready;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {run === undefined ? (
          <DialogHeader>
            <DialogTitle>{t("detailsMissingTitle")}</DialogTitle>
            <DialogDescription>{t("detailsMissingDescription")}</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("detailsTitle", { workflow: workflowLabel.name(run.workflowId) })}</DialogTitle>
              <DialogDescription>
                {t("detailsDescription", { organization: labels.organizationLabel(run.tenantId), id: run.runId })}
              </DialogDescription>
            </DialogHeader>
            <RunTimeline
              run={run}
              label={t("timelineLabel")}
              starterLabel={run.startedBy === null ? undefined : labels.userLabel(run.startedBy)}
              scheduleLabel={run.scheduleId === null ? undefined : labels.scheduleLabel(run.scheduleId)}
            />
            <p className="text-xs text-muted-foreground">{t("noStepEvents")}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunsEmpty({
  filtering,
  onClear,
  onSchedules,
}: {
  filtering: boolean;
  onClear: () => void;
  onSchedules: () => void;
}) {
  const t = useTranslations("admin.workflows.runs");
  return filtering ? (
    <EmptyState
      frame="plain"
      headingLevel={2}
      icon="search"
      title={t("noMatchTitle")}
      description={t("noMatchDescription")}
      action={
        <Button variant="secondary" onClick={onClear}>
          {t("clearFilters")}
        </Button>
      }
    />
  ) : (
    <EmptyState
      frame="plain"
      headingLevel={2}
      icon="workflow"
      title={t("emptyTitle")}
      description={t("emptyDescription")}
      action={
        <Button variant="secondary" onClick={onSchedules}>
          {t("emptyAction")}
        </Button>
      }
    />
  );
}

export type RunsPanelProps = {
  values: RunFilterValues;
  onChange: (patch: FilterPatch) => void;
  /** Run whose details are open (`?run=`), so a reload or a shared link opens it again. */
  openRunId: string | undefined;
  onOpenRunChange: (runId: string | undefined) => void;
  organizationLabel: (tenantId: string | null) => string;
  onSeeSchedules: () => void;
};

/**
 * Runs tab of `/admin/workflows`: every organization's runs and the platform's, filtered by
 * organization, workflow and status in the URL (one press shows the suspended ones, which wait
 * for an approval), paged by cursor, with the run's timeline and a cancel for runs still alive.
 */
export function RunsPanel({
  values,
  onChange,
  openRunId,
  onOpenRunChange,
  organizationLabel,
  onSeeSchedules,
}: RunsPanelProps) {
  const t = useTranslations("admin.workflows.runs");
  const filters = {
    organizationId: values.organizationId,
    workflowId: values.workflowId !== undefined && WORKFLOW_ID.test(values.workflowId) ? values.workflowId : undefined,
    status: isStatus(values.status) ? values.status : undefined,
  };
  const runs = useAdminWorkflowRuns(filters);
  const paged = useCursorPages(runs, ADMIN_RUNS_PAGE_LIMIT, t("pagination"));
  // One lookup for the starters of the page on screen (decision 0044), never one per row.
  const canReadUsers = usePlatformPermissions().can("platform.user.read");
  const userLabel = useAdminUserNames(
    paged.rows.map((run) => run.startedBy),
    { enabled: canReadUsers },
  );
  // The schedules of the same organization filter (the schedules tab's cached list) name the runs they started.
  const scheduleLabel = useScheduleLabels(useAdminSchedules(filters.organizationId).data);
  const [canceling, setCanceling] = useState<AdminWorkflowRun | null>(null);
  const filtering = Object.values(filters).some((value) => value !== undefined);
  return (
    <div className="flex flex-col gap-4">
      <RunFilters values={values} onChange={onChange} />
      <AdminQuerySection query={runs} loadingLabel={t("loading")}>
        {() => (
          <RunsTable
            runs={paged.rows}
            pagination={paged.pagination}
            organizationLabel={organizationLabel}
            userLabel={userLabel}
            scheduleLabel={scheduleLabel}
            onDetails={(run) => onOpenRunChange(run.runId)}
            onCancel={setCanceling}
            empty={
              <RunsEmpty
                filtering={filtering}
                onClear={() => onChange({ organizationId: undefined, workflowId: undefined, status: undefined })}
                onSchedules={onSeeSchedules}
              />
            }
          />
        )}
      </AdminQuerySection>
      <RunDetailsDialog
        runId={openRunId}
        run={paged.rows.find((run) => run.runId === openRunId)}
        ready={runs.isSuccess}
        labels={{ organizationLabel, userLabel, scheduleLabel }}
        onClose={() => onOpenRunChange(undefined)}
      />
      <CancelRunDialog run={canceling} onOpenChange={(open) => !open && setCanceling(null)} />
    </div>
  );
}
