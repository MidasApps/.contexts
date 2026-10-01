"use client";

import { formatDateTime } from "@core/i18n";
import { createContext, use, useMemo, type ReactNode } from "react";
import { useLocale, useTimeZone, useTranslations } from "use-intl";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";

/** A schedule row: the fields tenant and staff schedules share. */
export type ScheduleRow = {
  readonly id: string;
  /** Absent for tenant pages, where every schedule is the organization's own. */
  readonly scope?: "platform" | "tenant" | undefined;
  readonly tenantId: string | null;
  readonly workflowId: string;
  readonly cron: string;
  readonly timezone: string;
  readonly status: "active" | "paused";
  readonly nextFireAt: string | null;
  readonly lastFireAt: string | null;
};

export type ScheduleTableProps<Row extends ScheduleRow> = {
  /** Table name (visually hidden). */
  caption: string;
  schedules: readonly Row[];
  /** Whose schedule it is, in words; omit on pages of a single organization. */
  ownerLabel?: ((schedule: Row) => string) | undefined;
  /** The viewer may pause, resume and run now. */
  canManage: boolean;
  /** Writes wait (offline). */
  disabled?: boolean | undefined;
  /** Schedule whose pause or resume is in flight. */
  pendingId: string | null;
  onPause: (schedule: Row) => void;
  onResume: (schedule: Row) => void;
  /** Opens the caller's confirmation; the run starts there. */
  onRunNow: (schedule: Row) => void;
  /** More actions of a row (edit, delete), after run-now; shown only when `canManage`. */
  renderRowActions?: ((schedule: Row) => ReactNode) | undefined;
  empty: ReactNode;
};

type TableState = Pick<ScheduleTableProps<ScheduleRow>, "ownerLabel" | "canManage" | "disabled" | "pendingId" | "onPause" | "onResume" | "onRunNow" | "renderRowActions">;

// Cells read the changing state from context so the column definitions never change identity
// (TanStack remounts cells when they do, which drops clicks made while data loads).
const TableStateContext = createContext<TableState | null>(null);
const useTableState = (): TableState => {
  const state = use(TableStateContext);
  if (state === null) throw new Error("schedule cells must render inside ScheduleTable");
  return state;
};

const column = dataTableColumnHelper<ScheduleRow>();

function Fire({ iso, timezone }: { iso: string | null; timezone: string }) {
  const t = useTranslations("common.scheduleTable");
  const locale = useLocale();
  const viewerZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (iso === null) return <span className="text-muted-foreground">{t("noFire")}</span>;
  const inSchedule = formatDateTime(iso, { locale, timeZone: timezone, style: "datetime" });
  return (
    <span className="flex flex-col">
      <span>{t("inZone", { when: inSchedule, zone: timezone })}</span>
      {viewerZone === timezone ? null : (
        <span className="text-[11.5px] text-muted-foreground">{t("inYourZone", { when: formatDateTime(iso, { locale, timeZone: viewerZone, style: "datetime" }), zone: viewerZone })}</span>
      )}
    </span>
  );
}

function Workflow({ schedule }: { schedule: ScheduleRow }) {
  const t = useTranslations("common.scheduleTable");
  const { ownerLabel } = useTableState();
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{schedule.workflowId}</span>
        {schedule.scope === undefined ? null : <StatusPill tone={schedule.scope === "platform" ? "violet" : "blue"}>{t(`scope.${schedule.scope}`)}</StatusPill>}
      </span>
      {ownerLabel === undefined ? null : <span className="text-[13px] text-muted-foreground">{ownerLabel(schedule)}</span>}
      <span className="font-mono text-[11.5px] text-muted-foreground">{schedule.id}</span>
    </span>
  );
}

function Cron({ schedule }: { schedule: ScheduleRow }) {
  return (
    <span className="flex flex-col">
      <code className="font-mono text-[13px]">{schedule.cron}</code>
      <span className="text-[11.5px] text-muted-foreground">{schedule.timezone}</span>
    </span>
  );
}

function Status({ status }: { status: ScheduleRow["status"] }) {
  const t = useTranslations("common.scheduleTable.status");
  return <StatusPill tone={status === "active" ? "emerald" : "amber"}>{t(status)}</StatusPill>;
}

function Actions({ schedule }: { schedule: ScheduleRow }) {
  const t = useTranslations("common.scheduleTable");
  const { canManage, disabled = false, pendingId, onPause, onResume, onRunNow, renderRowActions } = useTableState();
  if (!canManage) return null;
  const pending = pendingId === schedule.id;
  const blocked = disabled || pendingId !== null;
  const name = schedule.workflowId;
  return (
    <span className="flex flex-wrap justify-end gap-2">
      {schedule.status === "active" ? (
        <Button variant="outline" size="sm" pending={pending} disabled={blocked} onClick={() => onPause(schedule)} aria-label={t("pauseNamed", { name, id: schedule.id })}>
          {t("pause")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" pending={pending} disabled={blocked} onClick={() => onResume(schedule)} aria-label={t("resumeNamed", { name, id: schedule.id })}>
          {t("resume")}
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={blocked} onClick={() => onRunNow(schedule)} aria-label={t("runNowNamed", { name, id: schedule.id })}>
        {t("runNow")}
      </Button>
      {renderRowActions?.(schedule)}
    </span>
  );
}

const useColumns = () => {
  const t = useTranslations("common.scheduleTable");
  return useMemo(
    () => [
      column.display({ id: "workflow", header: () => t("columns.workflow"), cell: ({ row }) => <Workflow schedule={row.original} /> }),
      column.display({ id: "cron", header: () => t("columns.cron"), cell: ({ row }) => <Cron schedule={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <Status status={getValue()} /> }),
      column.display({ id: "next", header: () => t("columns.nextFire"), cell: ({ row }) => <Fire iso={row.original.nextFireAt} timezone={row.original.timezone} /> }),
      column.display({ id: "last", header: () => t("columns.lastFire"), cell: ({ row }) => <Fire iso={row.original.lastFireAt} timezone={row.original.timezone} /> }),
      column.display({ id: "actions", header: () => t("columns.actions"), meta: { headerHidden: true }, cell: ({ row }) => <Actions schedule={row.original} /> }),
    ],
    [t],
  );
};

/**
 * Schedules with their cron and time zone, state, and the next and last fire shown in the
 * schedule's own zone and in the viewer's (they differ for most people, and a cron only means
 * something in its zone). Pause, resume and run-now are callbacks: the caller owns the endpoints,
 * the confirmation and the toasts. Phones get cards.
 */
export function ScheduleTable<Row extends ScheduleRow>({ caption, schedules, empty, ...state }: ScheduleTableProps<Row>) {
  const t = useTranslations("common.scheduleTable");
  const columns = useColumns();
  return (
    // The callbacks take `Row`; cells hand back the very rows they were given.
    <TableStateContext value={state as unknown as TableState}>
      <DataTable<ScheduleRow>
        caption={caption}
        captionHidden
        columns={columns}
        data={schedules}
        getRowId={(schedule) => schedule.id}
        stateHeadingLevel={2}
        renderCard={(schedule) => (
          <div className="flex flex-col gap-2">
            <span className="flex items-start justify-between gap-2">
              <Workflow schedule={schedule} />
              <Status status={schedule.status} />
            </span>
            <Cron schedule={schedule} />
            <span className="text-xs">
              <span className="text-muted-foreground">{t("columns.nextFire")}: </span>
              <Fire iso={schedule.nextFireAt} timezone={schedule.timezone} />
            </span>
            <span className="self-start">
              <Actions schedule={schedule} />
            </span>
          </div>
        )}
        empty={empty}
      />
    </TableStateContext>
  );
}
