"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useAdminOrganizationId } from "#/entities/session/index.ts";
import { AdminImpersonationNotice } from "#/features/admin-impersonation/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { useImpersonationClaim } from "#/shared/lib/session/use-impersonation.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Separator } from "#/shared/ui/atoms/Separator/Separator.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { AdminShellTemplate } from "#/shared/ui/templates/AdminShellTemplate/AdminShellTemplate.tsx";
import { type AdminContext, AdminSidebar, adminContextOf } from "#/widgets/admin-sidebar/index.ts";
import { usePageLabel } from "#/widgets/app-topbar/index.ts";
import { ImpersonationBanner } from "#/widgets/impersonation-banner/index.ts";
import { OrganizationSwitcher } from "#/widgets/organization-switcher/index.ts";
import { UserMenu } from "#/widgets/user-menu/index.ts";
import { OfflineBanner } from "./offline-banner.tsx";

export type AdminLayoutProps = {
  children: ReactNode;
  /** Desktop sidebar state from the host (web: shadcn's `sidebar_state` cookie read on the server). */
  sidebarDefaultOpen?: boolean;
  persistSidebarState?: (open: boolean) => void;
};

const CONTEXT_LABEL_KEYS: Record<AdminContext, string> = {
  organization: "topbar.organization",
  account: "topbar.account",
  platform: "topbar.platform",
};

/** Picking an organization in the administration opens its settings, not its home in the app. */
const organizationAdministration = (organizationId: string): Route => ({ id: "settings-index", organizationId });

/**
 * The surface, the part of it and the page ("Administration · Organization · Members"), the staff
 * badge in the platform console, and the way back to the application, always one click away.
 */
function AdminTopbar({ context }: { context: AdminContext }) {
  const t = useTranslations("admin");
  const page = usePageLabel();
  const organizationId = useAdminOrganizationId();
  const app: Route = organizationId === undefined ? { id: "home" } : { id: "organization", organizationId };
  return (
    <>
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-1 data-[orientation=vertical]:h-4" />
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden font-medium sm:inline">{t("surface")}</span>
        <Icon name="chevron-right" className="hidden size-3.5 text-muted-foreground sm:inline" />
        <span className="truncate text-muted-foreground">{t(CONTEXT_LABEL_KEYS[context])}</span>
        {page === undefined ? null : (
          <>
            <Icon name="chevron-right" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{page}</span>
          </>
        )}
      </p>
      <div className="ms-auto flex items-center gap-2">
        {context === "platform" ? (
          <StatusPill tone="violet" icon="shield" className="max-sm:hidden">
            {t("topbar.badge")}
          </StatusPill>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <RouteLink to={app}>
            <Icon name="layout-dashboard" />
            <span className="max-sm:sr-only">{t("topbar.openApp")}</span>
          </RouteLink>
        </Button>
      </div>
    </>
  );
}

/**
 * The page, or why it cannot open: in support mode the tab's token is the user's, so the platform
 * console's calls would fail (follow-up 92) and it explains instead; the organization's settings
 * and the profile open read-only, as the user sees them.
 */
function AdminContent({ context, children }: { context: AdminContext; children: ReactNode }) {
  const impersonation = useImpersonationClaim();
  if (context !== "platform") return children;
  if (impersonation === undefined) return null;
  return impersonation === null ? children : <AdminImpersonationNotice />;
}

/**
 * Layout of the administration (`/admin`, decision 0077; FSD app layer composes the widgets): the
 * organization switcher leading to each organization's settings, the sidebar with the sections of
 * the current part (organization, account or platform console), the user menu, a topbar naming
 * where the page is with the way back to the application, the offline and support-mode banners. No
 * chat and no command palette: configuring is not using the app.
 */
export function AdminLayout({ children, sidebarDefaultOpen, persistSidebarState }: AdminLayoutProps) {
  const t = useTranslations("admin.sidebar");
  const context = adminContextOf(useRouter().useLocationPath());
  const organizationId = useAdminOrganizationId();
  return (
    <AdminShellTemplate
      sidebar={
        <AdminSidebar
          header={
            <OrganizationSwitcher
              organizationId={organizationId}
              destination={organizationAdministration}
              caption={t("title")}
            />
          }
          footer={<UserMenu />}
        />
      }
      topbar={<AdminTopbar context={context} />}
      {...(sidebarDefaultOpen === undefined ? {} : { sidebarDefaultOpen })}
      {...(persistSidebarState === undefined ? {} : { persistSidebarState })}
    >
      <div className="flow-root">
        <OfflineBanner className="mb-4 empty:mb-0" />
        {/* In the console the support notice replaces the page and already offers to leave. */}
        {context === "platform" ? null : <ImpersonationBanner className="mb-4 empty:mb-0" />}
      </div>
      <AdminContent context={context}>{children}</AdminContent>
    </AdminShellTemplate>
  );
}
