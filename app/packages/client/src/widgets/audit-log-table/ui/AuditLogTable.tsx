"use client";

import { AUDIT_ACTIONS, type AuditAction, type AuditLogEntry, type PlatformAuditLogEntry } from "@core/contracts";
import { type ReactNode, useMemo } from "react";
import { useLocale, useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { type CursorListState, useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Combobox } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { type DataTableQuery, dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";

/** A tenant or platform audit entry: both share every column this table shows. */
export type AuditRow = AuditLogEntry | PlatformAuditLogEntry;

const ALL = "all";
const OUTCOME_TONES: Record<AuditRow["outcome"], StatusTone> = {
  success: "emerald",
  denied: "danger",
  failed: "amber",
  "pending-approval": "blue",
};

const column = dataTableColumnHelper<AuditRow>();

type NameOf = (uid: string) => string | undefined;

/** Who did it: a person's name when known, else the kind of actor and its id. */
function Actor({ entry, nameOf }: { entry: AuditRow; nameOf: NameOf }) {
  const t = useTranslations("settings.auditLog");
  const name = entry.actor.type === "user" ? nameOf(entry.actor.id) : undefined;
  return (
    <span className="flex flex-col">
      <span>{name ?? t(`actorTypes.${entry.actor.type}`)}</span>
      {name === undefined && entry.actor.type !== "system" ? (
        <span className="font-mono text-caption break-all text-muted-foreground">{entry.actor.id}</span>
      ) : null}
      {entry.actor.onBehalfOf === undefined ? null : (
        <span className="text-caption text-muted-foreground">
          {t("onBehalfOf", { name: nameOf(entry.actor.onBehalfOf) ?? entry.actor.onBehalfOf })}
        </span>
      )}
    </span>
  );
}

/** What it was done to: the kind of resource (in words when known), its id and the changed fields. */
function Target({ entry }: { entry: AuditRow }) {
  const t = useTranslations("settings.auditLog");
  const key = `targetTypes.${entry.target.type}`;
  return (
    <span className="flex flex-col">
      <span>{t.has(key) ? t(key) : entry.target.type}</span>
      <span className="font-mono text-caption break-all text-muted-foreground">{entry.target.id}</span>
      {entry.changes === undefined || entry.changes.length === 0 ? null : (
        <span className="text-caption text-muted-foreground">{t("changes", { fields: entry.changes.join(", ") })}</span>
      )}
    </span>
  );
}

const useColumns = (nameOf: NameOf, organizationOf: ((entry: AuditRow) => ReactNode) | undefined) => {
  const t = useTranslations("settings.auditLog");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({
        id: "occurredAt",
        header: () => t("columns.occurredAt"),
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.occurredAt)}</span>,
      }),
      column.display({
        id: "action",
        header: () => t("columns.action"),
        cell: ({ row }) => t(`actions.${row.original.action}`),
      }),
      column.display({
        id: "actor",
        header: () => t("columns.actor"),
        cell: ({ row }) => <Actor entry={row.original} nameOf={nameOf} />,
      }),
      column.display({
        id: "target",
        header: () => t("columns.target"),
        cell: ({ row }) => <Target entry={row.original} />,
      }),
      ...(organizationOf === undefined
        ? []
        : [
            column.display({
              id: "organization",
              header: () => t("columns.organization"),
              cell: ({ row }) => organizationOf(row.original),
            }),
          ]),
      column.display({
        id: "outcome",
        header: () => t("columns.outcome"),
        cell: ({ row }) => (
          <StatusPill tone={OUTCOME_TONES[row.original.outcome]}>{t(`outcomes.${row.original.outcome}`)}</StatusPill>
        ),
      }),
    ],
    [formatDateTime, nameOf, organizationOf, t],
  );
};

/** Every audited action by its label, "all actions" first; `undefined` is all of them. */
export function AuditActionFilter({
  value,
  onChange,
}: {
  value: AuditAction | undefined;
  onChange: (next: AuditAction | undefined) => void;
}) {
  const t = useTranslations("settings.auditLog");
  const locale = useLocale();
  const groups = useMemo(() => {
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    const actions = AUDIT_ACTIONS.map((action) => ({ value: action, label: t(`actions.${action}`) })).toSorted((a, b) =>
      collator.compare(a.label, b.label),
    );
    return [{ options: [{ value: ALL, label: t("allActions") }] }, { heading: t("actionGroup"), options: actions }];
  }, [locale, t]);
  return (
    <Combobox
      aria-label={t("filterLabel")}
      className="w-full sm:w-80"
      groups={groups}
      value={value ?? ALL}
      onValueChange={(selected) => onChange(selected === ALL ? undefined : (selected as AuditAction))}
      placeholder={t("allActions")}
      searchLabel={t("searchAction")}
      searchPlaceholder={t("searchAction")}
      emptyText={t("noActionFound")}
    />
  );
}

/** The action of a URL search value, `undefined` for none, "all" or anything unknown. */
export const auditActionOf = (value: string | undefined): AuditAction | undefined =>
  value !== undefined && (AUDIT_ACTIONS as readonly string[]).includes(value) ? (value as AuditAction) : undefined;

export type AuditLogTableProps = {
  caption: string;
  /** The merged pages of a cursor list query (`useAuditLog`, `usePlatformAuditLog`). */
  entries: CursorListState<AuditRow> & DataTableQuery;
  pageLimit: number;
  /** A person's name by uid, `undefined` when unknown (the table then shows the id). */
  nameOf: NameOf;
  /** Adds an "Organization" column (the platform log). */
  organizationOf?: ((entry: AuditRow) => ReactNode) | undefined;
  filtered: boolean;
};

/**
 * An audit log, newest first, one row per entry: when, action, who (with "by support" under
 * impersonation), target with the changed field names (never values) and outcome.
 */
export function AuditLogTable({ caption, entries, pageLimit, nameOf, organizationOf, filtered }: AuditLogTableProps) {
  const t = useTranslations("settings.auditLog");
  const columns = useColumns(nameOf, organizationOf);
  const paged = useCursorPages(entries, pageLimit, t("pagination"));
  return (
    <DataTable
      caption={caption}
      columns={columns}
      data={paged.rows}
      getRowId={(entry) => entry.id}
      status={dataTableStatusOf(entries)}
      pagination={paged.pagination}
      stateHeadingLevel={2}
      empty={
        <EmptyState
          frame="plain"
          headingLevel={2}
          icon="history"
          title={filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
          description={t("emptyDescription")}
        />
      }
    />
  );
}
