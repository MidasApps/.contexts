"use client";

import { AdminLayout, AppLayout } from "@core/client/app-shell";
import type { ReactNode } from "react";

/** shadcn's sidebar cookie: the server reads it so the first render has the right width. */
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// A UI preference, not a secret: readable by the page, same-site only.
const persistSidebarState = (open: boolean): void => {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${String(open)}; path=/; max-age=${String(SIDEBAR_COOKIE_MAX_AGE_SECONDS)}; samesite=lax`;
};

type WebLayoutProps = { readonly children: ReactNode; readonly sidebarDefaultOpen: boolean };

/** The user area's shell (`AppLayout`) with the sidebar state in a cookie (SP2 spec §9). */
export function WebAppLayout({ children, sidebarDefaultOpen }: WebLayoutProps) {
  return (
    <AppLayout sidebarDefaultOpen={sidebarDefaultOpen} persistSidebarState={persistSidebarState}>
      {children}
    </AppLayout>
  );
}

/** The `/admin` surface shell (`AdminLayout`), same sidebar cookie. */
export function WebAdminLayout({ children, sidebarDefaultOpen }: WebLayoutProps) {
  return (
    <AdminLayout sidebarDefaultOpen={sidebarDefaultOpen} persistSidebarState={persistSidebarState}>
      {children}
    </AdminLayout>
  );
}
