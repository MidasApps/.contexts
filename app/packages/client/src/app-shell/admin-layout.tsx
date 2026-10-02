"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { AdminImpersonationNotice } from "#/features/admin-impersonation/index.ts";
import { useImpersonationClaim } from "#/shared/lib/session/use-impersonation.ts";
import { Separator } from "#/shared/ui/atoms/Separator/Separator.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { AdminShellTemplate } from "#/shared/ui/templates/AdminShellTemplate/AdminShellTemplate.tsx";
import { AdminSidebar } from "#/widgets/admin-sidebar/index.ts";
import { UserMenu } from "#/widgets/user-menu/index.ts";
import { OfflineBanner } from "./offline-banner.tsx";

export type AdminLayoutProps = {
  children: ReactNode;
  /** Desktop sidebar state from the host (web: shadcn's `sidebar_state` cookie read on the server). */
  sidebarDefaultOpen?: boolean;
  persistSidebarState?: (open: boolean) => void;
};

function AdminTopbar() {
  const t = useTranslations("admin");
  return (
    <>
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <p className="truncate text-sm font-medium">{t("surface")}</p>
      <div className="ml-auto">
        <StatusPill tone="violet" icon="shield">
          {t("topbar.badge")}
        </StatusPill>
      </div>
    </>
  );
}

/**
 * Layout of the `/admin` surface (SP2 spec §7, web only; FSD app layer composes the widgets): the
 * admin sidebar with the user menu, a topbar naming the surface, the offline banner. Mounted only
 * after the server guard accepted a staff session with MFA. In support mode that guard passes on the
 * staff cookie while the tab's token is the user's, so the pages are not mounted (their calls would
 * fail): the layout explains and offers to leave (follow-up 92). Nothing mounts until the token
 * is read.
 */
export function AdminLayout({ children, sidebarDefaultOpen, persistSidebarState }: AdminLayoutProps) {
  const impersonation = useImpersonationClaim();
  return (
    <AdminShellTemplate
      sidebar={<AdminSidebar footer={<UserMenu />} />}
      topbar={<AdminTopbar />}
      {...(sidebarDefaultOpen === undefined ? {} : { sidebarDefaultOpen })}
      {...(persistSidebarState === undefined ? {} : { persistSidebarState })}
    >
      <OfflineBanner className="mb-4 empty:mb-0" />
      {impersonation === undefined ? null : impersonation === null ? children : <AdminImpersonationNotice />}
    </AdminShellTemplate>
  );
}
