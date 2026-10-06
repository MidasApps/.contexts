"use client";

import { LoadingState } from "@core/client/shared/ui/molecules/LoadingState/LoadingState";
import { AppShellSkeleton } from "@core/client/shared/ui/templates/AppShellSkeleton/AppShellSkeleton";
import { useTranslations } from "use-intl";

/**
 * Fallback while a guarded layout checks the session on the server (Cache Components streams it
 * inside `<Suspense>`): the shell's frame without data, so the sidebar, topbar and page header do
 * not jump in, and one polite status. `sidebarOpen` comes from the sidebar cookie once the request
 * is known; the static shell assumes the expanded sidebar.
 */
export function ShellSkeleton({ sidebarOpen = true }: { sidebarOpen?: boolean }) {
  const t = useTranslations("shell.home");
  return <AppShellSkeleton label={t("loading")} sidebarOpen={sidebarOpen} />;
}

/** Fallback of the entry pages (sign-in, invitation) while their search params resolve. */
export function EntrySkeleton() {
  return (
    <main id="main" className="grid min-h-svh place-items-center px-6">
      <LoadingState variant="spinner" />
    </main>
  );
}
