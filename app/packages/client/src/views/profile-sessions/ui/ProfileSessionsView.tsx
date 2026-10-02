"use client";

import type { SessionSummary } from "@core/contracts";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { SESSIONS_PAGE_LIMIT, useMySessions } from "#/entities/session/index.ts";
import { RevokeSessionDialog, SignOutEverywhereButton } from "#/features/revoke-session/index.ts";
import { SignOutButton } from "#/features/sign-out/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableStatusOf } from "#/shared/ui/organisms/DataTable/data-table-status.ts";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { ProfilePageFrame } from "#/widgets/profile-nav/index.ts";

const column = dataTableColumnHelper<SessionSummary>();

function SessionDevice({ session }: { session: SessionSummary }) {
  const t = useTranslations("profile.sessions");
  return (
    <span className="flex items-center gap-2.5">
      <Icon name={session.kind === "desktop" ? "monitor" : "globe"} className="size-4 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{session.userAgent === "" ? t("unknownDevice") : session.userAgent}</span>
        <span className="text-xs text-muted-foreground">{t(`kinds.${session.kind}`)}</span>
      </span>
      {session.current ? (
        <StatusPill tone="blue" icon="monitor">
          {t("current")}
        </StatusPill>
      ) : null}
      {session.mfa ? (
        <StatusPill tone="emerald" icon="shield-check">
          {t("mfa")}
        </StatusPill>
      ) : null}
    </span>
  );
}

/**
 * Revoke for other sessions; the current one is ended by signing out (its revocation would only
 * surface at the next request, SP1 `SessionSummary.current`).
 */
function SessionAction({ session, onRevoke, className }: { session: SessionSummary; onRevoke: () => void; className?: string }) {
  const t = useTranslations("profile.sessions");
  if (session.current) {
    return (
      <SignOutButton size="sm" className={className}>
        {t("signOutCurrent")}
      </SignOutButton>
    );
  }
  return (
    <Button variant="outline" size="sm" className={className} onClick={onRevoke} aria-label={t("revokeNamed", { name: session.userAgent })}>
      {t("revokeAction")}
    </Button>
  );
}

const useColumns = (onRevoke: (session: SessionSummary) => void) => {
  const t = useTranslations("profile.sessions");
  const formatDateTime = useFormatDateTime();
  return useMemo(
    () => [
      column.display({ id: "device", header: () => t("columns.device"), cell: ({ row }) => <SessionDevice session={row.original} /> }),
      column.accessor("lastSeenAt", { header: () => t("columns.lastSeen"), cell: ({ getValue }) => formatDateTime(getValue()) }),
      column.accessor("createdAt", { header: () => t("columns.created"), cell: ({ getValue }) => formatDateTime(getValue(), "date") }),
      column.accessor("expiresAt", { header: () => t("columns.expires"), cell: ({ getValue }) => formatDateTime(getValue(), "date") }),
      column.display({
        id: "actions",
        header: () => t("columns.actions"),
        meta: { headerHidden: true },
        cell: ({ row }) => <SessionAction session={row.original} onRevoke={() => onRevoke(row.original)} />,
      }),
    ],
    [formatDateTime, onRevoke, t],
  );
};

function SessionCard({ session, onRevoke }: { session: SessionSummary; onRevoke: () => void }) {
  const t = useTranslations("profile.sessions");
  const formatDateTime = useFormatDateTime();
  return (
    <div className="flex flex-col gap-3">
      <SessionDevice session={session} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("columns.lastSeen")}</dt>
        <dd>{formatDateTime(session.lastSeenAt)}</dd>
        <dt className="text-muted-foreground">{t("columns.expires")}</dt>
        <dd>{formatDateTime(session.expiresAt, "date")}</dd>
      </dl>
      <SessionAction session={session} onRevoke={onRevoke} className="self-start" />
    </div>
  );
}

/**
 * `/profile/sessions` (SP2 spec §8): active web and desktop sessions (browser/OS family, second
 * factor, last seen, expiry in the display time zone), "this device" marked (SP1 `current`) with
 * a sign-out instead of a revoke, revoke another one (confirmed; the row leaves at once and returns
 * if the call fails) or sign out everywhere, this device included.
 */
export function ProfileSessionsView() {
  const t = useTranslations("profile.sessions");
  const sessions = useMySessions();
  const [target, setTarget] = useState<SessionSummary | null>(null);
  const columns = useColumns(setTarget);
  const paged = useCursorPages(sessions, SESSIONS_PAGE_LIMIT, t("pagination"));
  return (
    <ProfilePageFrame width="wide" header={<PageHeader title={t("title")} description={t("description")} />}>
      <div className="flex flex-col gap-6">
        <SectionCard title={t("listTitle")} description={t("listDescription")}>
          <DataTable
            caption={t("caption")}
            captionHidden
            columns={columns}
            data={paged.rows}
            getRowId={(session) => session.id}
            status={dataTableStatusOf(sessions)}
            pagination={paged.pagination}
            renderCard={(session) => <SessionCard session={session} onRevoke={() => setTarget(session)} />}
            empty={<EmptyState frame="plain" headingLevel={3} icon="monitor" title={t("emptyTitle")} description={t("emptyDescription")} />}
          />
        </SectionCard>
        <SectionCard tone="danger" title={t("revokeAll.title")} description={t("revokeAll.sectionDescription")}>
          <div>
            <SignOutEverywhereButton />
          </div>
        </SectionCard>
      </div>
      <RevokeSessionDialog session={target} onOpenChange={(open) => !open && setTarget(null)} label={target?.userAgent ?? ""} />
    </ProfilePageFrame>
  );
}
