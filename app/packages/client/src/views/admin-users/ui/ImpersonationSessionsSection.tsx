"use client";

import type { AdminImpersonationSession } from "@core/contracts";
import { createContext, use, useId, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { AdminUserRef, useAdminUserNames } from "#/entities/admin-user/index.ts";
import {
  IMPERSONATION_SESSIONS_PAGE_LIMIT,
  type ImpersonationSessionScope,
  useAdminImpersonationSessions,
} from "#/entities/impersonation-session/index.ts";
import { EndImpersonationSessionDialog } from "#/features/admin-impersonation/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminQuerySection, useAdminSearch } from "#/widgets/admin-nav/index.ts";

const column = dataTableColumnHelper<AdminImpersonationSession>();
const STATUS_TONES: Record<AdminImpersonationSession["status"], StatusTone> = {
  active: "amber",
  ended: "neutral",
  expired: "neutral",
};

/** What a row needs beyond the session: names, and the end action when the viewer may use it. */
type RowHelpers = {
  readonly userLabel: (id: string) => string;
  readonly organizationLabel: (id: string) => string;
  readonly onEnd: ((session: AdminImpersonationSession) => void) | undefined;
  readonly disabled: boolean;
};

// Cells read the helpers from context, not from the column definitions: the columns stay the same
// objects while names load, so a button never remounts under the pointer.
const RowHelpersContext = createContext<RowHelpers | null>(null);

const useRowHelpers = (): RowHelpers => {
  const helpers = use(RowHelpersContext);
  if (helpers === null) throw new Error("session cells must render inside ImpersonationSessionsSection");
  return helpers;
};

function SessionUser({ id }: { id: string }) {
  return <AdminUserRef id={id} label={useRowHelpers().userLabel(id)} />;
}

function SessionOrganization({ id }: { id: string }) {
  return <span>{useRowHelpers().organizationLabel(id)}</span>;
}

function SessionStatus({ session }: { session: AdminImpersonationSession }) {
  const t = useTranslations("admin.users.sessions");
  return <StatusPill tone={STATUS_TONES[session.status]}>{t(`status.${session.status}`)}</StatusPill>;
}

function Until({ session }: { session: AdminImpersonationSession }) {
  const t = useTranslations("admin.users.sessions");
  const formatDateTime = useFormatDateTime();
  return (
    <span>
      {session.endedAt === null
        ? t("expiresAt", { when: formatDateTime(session.expiresAt) })
        : t("endedAt", { when: formatDateTime(session.endedAt) })}
    </span>
  );
}

function EndButton({ session }: { session: AdminImpersonationSession }) {
  const t = useTranslations("admin.users.sessions");
  const helpers = useRowHelpers();
  if (helpers.onEnd === undefined || session.status !== "active") return null;
  const { onEnd } = helpers;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={helpers.disabled}
      onClick={() => onEnd(session)}
      aria-label={t("endNamed", {
        staff: helpers.userLabel(session.staffUid),
        user: helpers.userLabel(session.targetUid),
      })}
    >
      {t("end")}
    </Button>
  );
}

const useColumns = () => {
  const t = useTranslations("admin.users.sessions");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({
        id: "staff",
        header: () => t("columns.staff"),
        cell: ({ row }) => <SessionUser id={row.original.staffUid} />,
      }),
      column.display({
        id: "user",
        header: () => t("columns.user"),
        cell: ({ row }) => <SessionUser id={row.original.targetUid} />,
      }),
      column.display({
        id: "organization",
        header: () => t("columns.organization"),
        cell: ({ row }) => <SessionOrganization id={row.original.tenantId} />,
      }),
      column.display({
        id: "reason",
        header: () => t("columns.reason"),
        cell: ({ row }) => <span className="block max-w-xs whitespace-normal">{row.original.reason}</span>,
      }),
      column.display({
        id: "started",
        header: () => t("columns.started"),
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      }),
      column.display({
        id: "until",
        header: () => t("columns.until"),
        cell: ({ row }) => <Until session={row.original} />,
      }),
      column.display({
        id: "status",
        header: () => t("columns.status"),
        cell: ({ row }) => <SessionStatus session={row.original} />,
      }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <EndButton session={row.original} />,
      }),
    ],
    [formatDateTime, t],
  );
};

function SessionsTable({
  scope,
  canEnd,
  onScopeReset,
}: {
  scope: ImpersonationSessionScope;
  canEnd: boolean;
  onScopeReset: () => void;
}) {
  const t = useTranslations("admin.users.sessions");
  const online = useOnlineStatus();
  const sessions = useAdminImpersonationSessions(scope);
  const paged = useCursorPages(sessions, IMPERSONATION_SESSIONS_PAGE_LIMIT, t("pagination"));
  const organizations = useAllAdminOrganizations();
  const userLabel = useAdminUserNames(paged.rows.flatMap((session) => [session.staffUid, session.targetUid]));
  const [ending, setEnding] = useState<AdminImpersonationSession | null>(null);
  const helpers = useMemo(
    (): RowHelpers => ({
      userLabel,
      organizationLabel: (id) => organizations.data?.find((organization) => organization.id === id)?.name ?? id,
      onEnd: canEnd ? setEnding : undefined,
      disabled: !online,
    }),
    [canEnd, online, organizations.data, userLabel],
  );
  const columns = useColumns();
  return (
    <RowHelpersContext value={helpers}>
      <AdminQuerySection query={sessions} loadingLabel={t("loading")} rows={3}>
        {() => (
          <DataTable
            caption={t("caption")}
            captionHidden
            columns={columns}
            data={paged.rows}
            getRowId={(session) => session.id}
            pagination={paged.pagination}
            stateHeadingLevel={3}
            renderCard={(session) => (
              <div className="flex flex-col gap-2">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm">
                    {t("cardWho", { staff: userLabel(session.staffUid), user: userLabel(session.targetUid) })}
                  </span>
                  <SessionStatus session={session} />
                </span>
                <span className="text-body">{helpers.organizationLabel(session.tenantId)}</span>
                <span className="text-body text-muted-foreground">{session.reason}</span>
                <span className="text-xs text-muted-foreground">
                  <Until session={session} />
                </span>
                <span className="self-start">
                  <EndButton session={session} />
                </span>
              </div>
            )}
            empty={
              scope === "active" ? (
                <EmptyState
                  frame="plain"
                  headingLevel={3}
                  icon="eye-off"
                  title={t("emptyActiveTitle")}
                  description={t("emptyActiveDescription")}
                  action={
                    <Button variant="secondary" onClick={onScopeReset}>
                      {t("seeAll")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  frame="plain"
                  headingLevel={3}
                  icon="eye-off"
                  title={t("emptyAllTitle")}
                  description={t("emptyAllDescription")}
                />
              )
            }
          />
        )}
      </AdminQuerySection>
      <EndImpersonationSessionDialog
        session={ending}
        staffLabel={ending === null ? "" : userLabel(ending.staffUid)}
        userLabel={ending === null ? "" : userLabel(ending.targetUid)}
        onOpenChange={(open) => !open && setEnding(null)}
      />
    </RowHelpersContext>
  );
}

/**
 * Support access sessions of every staff member on `/admin/users` (decision 0044,
 * platform.user.read): the ones open now, or all of them newest first, with who acted as whom,
 * where and why. Staff with `platform.user.impersonate` end an open session after a confirmation.
 */
export function ImpersonationSessionsSection({ canEnd }: { canEnd: boolean }) {
  const t = useTranslations("admin.users.sessions");
  const scopeId = useId();
  // The scope lives in the URL (`?sessions=all`), like every other admin filter.
  const search = useAdminSearch(["sessions"]);
  const scope: ImpersonationSessionScope = search.values.sessions === "all" ? "all" : "active";
  const setScope = (next: ImpersonationSessionScope): void =>
    search.set({ sessions: next === "all" ? "all" : undefined });
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={scopeId}>{t("scope")}</Label>
        <Select value={scope} onValueChange={(value) => setScope(value === "all" ? "all" : "active")}>
          <SelectTrigger id={scopeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("scopeOptions.active")}</SelectItem>
            <SelectItem value="all">{t("scopeOptions.all")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SessionsTable key={scope} scope={scope} canEnd={canEnd} onScopeReset={() => setScope("all")} />
    </SectionCard>
  );
}
