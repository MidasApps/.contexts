"use client";

import type { AdminWorkflowRun } from "@core/contracts";
import { createContext, use, useMemo, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { isRunCancelable, RunStatusPill } from "#/entities/workflow-run/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import type { CursorPagination } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

export type RunsTableState = {
  /** Organization name when the list knows it, else the id; "platform" for runs without one. */
  readonly organizationLabel: (tenantId: string | null) => string;
  /** Name of the user who started a run, or the id itself while unknown. */
  readonly userLabel: (userId: string) => string;
  readonly onDetails: (run: AdminWorkflowRun) => void;
  readonly onCancel: (run: AdminWorkflowRun) => void;
};

// Cells read late-loading state (organization and user names) from context, so the column definitions keep
// their identity and TanStack never remounts a cell under a click.
const RunsTableContext = createContext<RunsTableState | null>(null);
const useRunsState = (): RunsTableState => {
  const state = use(RunsTableContext);
  if (state === null) throw new Error("run cells must render inside RunsTable");
  return state;
};

const column = dataTableColumnHelper<AdminWorkflowRun>();

function RunName({ run }: { run: AdminWorkflowRun }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{run.workflowId}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">{run.runId}</span>
    </span>
  );
}

function Organization({ run }: { run: AdminWorkflowRun }) {
  return useRunsState().organizationLabel(run.tenantId);
}

/** Who or what started the run, and the approval a suspended run waits for. */
function Origin({ run }: { run: AdminWorkflowRun }) {
  const t = useTranslations("admin.workflows.runs");
  const { userLabel } = useRunsState();
  const origin = run.scheduleId !== null ? t("bySchedule", { schedule: run.scheduleId }) : run.startedBy !== null ? t("byUser", { user: userLabel(run.startedBy) }) : t("byPlatform");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="break-all">{origin}</span>
      {run.approvalRequestId === null ? null : <span className="text-[11.5px] break-all text-muted-foreground">{t("waitsApproval", { id: run.approvalRequestId })}</span>}
    </span>
  );
}

function When({ iso }: { iso: string }) {
  return useFormatDateTime()(iso);
}

function RunActions({ run }: { run: AdminWorkflowRun }) {
  const t = useTranslations("admin.workflows.runs");
  const online = useOnlineStatus();
  const { onDetails, onCancel } = useRunsState();
  return (
    <span className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => onDetails(run)} aria-label={t("detailsNamed", { workflow: run.workflowId, id: run.runId })}>
        {t("details")}
      </Button>
      {isRunCancelable(run.status) ? (
        <Button variant="outline" size="sm" disabled={!online} onClick={() => onCancel(run)} aria-label={t("cancelNamed", { workflow: run.workflowId, id: run.runId })}>
          {t("cancel")}
        </Button>
      ) : null}
    </span>
  );
}

const useColumns = () => {
  const t = useTranslations("admin.workflows.runs");
  return useMemo(
    () => [
      column.display({ id: "run", header: () => t("columns.run"), cell: ({ row }) => <RunName run={row.original} /> }),
      column.display({ id: "organization", header: () => t("columns.organization"), cell: ({ row }) => <Organization run={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <RunStatusPill status={getValue()} /> }),
      column.display({ id: "origin", header: () => t("columns.origin"), cell: ({ row }) => <Origin run={row.original} /> }),
      column.accessor("createdAt", { header: () => t("columns.createdAt"), cell: ({ getValue }) => <When iso={getValue()} /> }),
      column.accessor("updatedAt", { header: () => t("columns.updatedAt"), cell: ({ getValue }) => <When iso={getValue()} /> }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <RunActions run={row.original} /> }),
    ],
    [t],
  );
};

export type RunsTableProps = RunsTableState & { runs: readonly AdminWorkflowRun[]; pagination: CursorPagination | undefined; empty: ReactNode };

/** Runs of every organization and of the platform, with details and cancel per row; cards on phones. */
export function RunsTable({ runs, pagination, empty, ...state }: RunsTableProps) {
  const t = useTranslations("admin.workflows.runs");
  const columns = useColumns();
  return (
    <RunsTableContext value={state}>
      <DataTable
        caption={t("caption")}
        captionHidden
        columns={columns}
        data={runs}
        getRowId={(run) => run.runId}
        pagination={pagination}
        stateHeadingLevel={2}
        renderCard={(run) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-start justify-between gap-2">
              <RunName run={run} />
              <RunStatusPill status={run.status} />
            </span>
            <span className="text-[13px]">
              <Organization run={run} />
            </span>
            <span className="text-xs text-muted-foreground">
              <Origin run={run} />
            </span>
            <span className="text-xs text-muted-foreground">
              <When iso={run.createdAt} />
            </span>
            <span className="self-start">
              <RunActions run={run} />
            </span>
          </div>
        )}
        empty={empty}
      />
    </RunsTableContext>
  );
}
