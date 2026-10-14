"use client";

import type { ReactNode } from "react";
import { AppShellTemplate } from "#/shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx";

export type AdminShellTemplateProps = {
  /** The `admin-sidebar` widget (admin navigation slots, SP2 spec §7). */
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  sidebarDefaultOpen?: boolean;
  persistSidebarState?: (open: boolean) => void;
};

/**
 * Frame of the administration (`/admin`, decision 0077): the app-shell layout without the right
 * panel (no chat while configuring), marked with `data-surface="admin"`. Guarding (a session for the
 * surface, staff + MFA for the platform console) happens before this renders.
 */
export function AdminShellTemplate({
  sidebar,
  topbar,
  children,
  sidebarDefaultOpen,
  persistSidebarState,
}: AdminShellTemplateProps) {
  return (
    <div data-surface="admin" className="contents">
      <AppShellTemplate
        sidebar={sidebar}
        topbar={topbar}
        {...(sidebarDefaultOpen === undefined ? {} : { sidebarDefaultOpen })}
        {...(persistSidebarState === undefined ? {} : { persistSidebarState })}
      >
        {children}
      </AppShellTemplate>
    </div>
  );
}
