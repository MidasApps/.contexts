"use client";

import { type AccessContext, AUDIT_ACTIONS, type AuditAction, type AuditLogEntry } from "@core/contracts";
import { useMemo } from "react";
import { useLocale, useTranslations } from "use-intl";
import { AUDIT_LOG_PAGE_LIMIT, useAuditLog } from "#/entities/audit-log/index.ts";
import { useMemberNames } from "#/entities/member/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { searchOption, useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { Combobox } from "#/shared/ui/molecules/Combobox/Combobox.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

const ALL = "all";
const OUTCOME_TONES: Record<AuditLogEntry["outcome"], StatusTone> = {
  success: "emerald",
  denied: "danger",
  failed: "amber",
  "pending-approval": "blue",
};

const column = dataTableColumnHelper<AuditLogEntry>();

/** Who did it: a member's name when the viewer can list members, else the kind and id. */
function Actor({ entry, nameOf }: { entry: AuditLogEntry; nameOf: (uid: string | null) => string | undefined }) {
  const t = useTranslations("settings.auditLog");
  const name = entry.actor.type === "user" ? nameOf(entry.actor.id) : undefined;
  return (
    <span className="flex flex-col">
      <span>{name ?? t(`actorTypes.${entry.actor.type}`)}</span>
      {name === undefined && entry.actor.type !== "system" ? (
        <span className="font-mono text-caption text-muted-foreground">{entry.actor.id}</span>
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
function Target({ entry }: { entry: AuditLogEntry }) {
  const t = useTranslations("settings.auditLog");
  const key = `targetTypes.${entry.target.type}`;
  return (
    <span className="flex flex-col">
      <span>{t.has(key) ? t(key) : entry.target.type}</span>
      <span className="font-mono text-caption text-muted-foreground">{entry.target.id}</span>
      {entry.changes === undefined || entry.changes.length === 0 ? null : (
        <span className="text-caption text-muted-foreground">{t("changes", { fields: entry.changes.join(", ") })}</span>
      )}
    </span>
  );
}

const useColumns = (organizationId: string, canReadMembers: boolean) => {
  const t = useTranslations("settings.auditLog");
  const formatDateTime = useFormatDateTime();
  const nameOf = useMemberNames({ organizationId, canReadMembers });
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
      column.display({
        id: "outcome",
        header: () => t("columns.outcome"),
        cell: ({ row }) => (
          <StatusPill tone={OUTCOME_TONES[row.original.outcome]}>{t(`outcomes.${row.original.outcome}`)}</StatusPill>
        ),
      }),
    ],
    [formatDateTime, nameOf, t],
  );
};

/** Every audited action, by its label, plus "all actions" first. */
function ActionFilter({ value, onChange }: { value: AuditAction | undefined; onChange: (next?: AuditAction) => void }) {
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

function AuditLogTable({ context, action }: { context: AccessContext; action: AuditAction | undefined }) {
  const t = useTranslations("settings.auditLog");
  const { organization } = context;
  const entries = useAuditLog(organization.id, { action });
  const columns = useColumns(organization.id, context.permissions.includes("core.member.read"));
  const paged = useCursorPages(entries, AUDIT_LOG_PAGE_LIMIT, t("pagination"));
  return (
    <DataTable
      caption={t("caption", { organization: organization.name })}
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
          title={action === undefined ? t("emptyTitle") : t("emptyFilteredTitle")}
          description={t("emptyDescription")}
        />
      }
    />
  );
}

function SettingsAuditLog({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.auditLog");
  const { organization } = context;
  const search = useSettingsSearch(["action"]);
  const raw = searchOption<AuditAction | typeof ALL>(search.values.action, [ALL, ...AUDIT_ACTIONS], ALL);
  const action = raw === ALL ? undefined : raw;
  const allowed = context.permissions.includes("core.audit-log.read");
  return (
    <SettingsPageFrame
      width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFilter value={action} onChange={(next) => search.set({ action: next })} />
        <AuditLogTable context={context} action={action} />
      </div>
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/audit-log` (core.audit-log.read): who did what in the organization,
 * newest first, filtered by action (kept in the URL). Entries list changed field names, never
 * values; member names show when the viewer may list members (core.member.read).
 */
export function SettingsAuditLogView() {
  const t = useTranslations("settings.auditLog");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsAuditLog context={data} />}
    </QueryPage>
  );
}
