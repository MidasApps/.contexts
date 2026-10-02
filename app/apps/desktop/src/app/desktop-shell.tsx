import { AppLayout } from "@core/client/app-shell";
import { ENTRY_ROUTE_IDS, parseRoute, useRouter } from "@core/client/shared/lib/router";
import { useSession, type SessionState } from "@core/client/shared/lib/session";
import { AppShellSkeleton } from "@core/client/shared/ui/templates/AppShellSkeleton/AppShellSkeleton";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import type { DesktopApp } from "@/router-context.ts";

/** What the user area does in each session state (decision 0012 §5: the desktop guards in the root route). */
export type UserAreaAccess = "wait" | "allow" | "sign-in";

export const userAreaAccess = (status: SessionState["status"]): UserAreaAccess => {
  switch (status) {
    case "booting":
    case "exchanging":
      return "wait";
    case "signed-in":
      return "allow";
    case "signed-out":
    case "mfa-required":
      return "sign-in";
  }
};

function UserAreaGate({ href, sidebarOpen, children }: { href: string; sidebarOpen: boolean; children: ReactNode }) {
  const t = useTranslations("auth.signIn");
  const { state } = useSession();
  const router = useRouter();
  const access = userAreaAccess(state.status);
  useEffect(() => {
    // `next` brings the user back here after signing in (only internal routes are honoured).
    if (access === "sign-in") router.navigate({ id: "sign-in", next: href }, { replace: true });
  }, [access, href, router]);
  if (access === "allow") return children;
  // The shell's frame (with the stored sidebar width) instead of a lone spinner, so nothing jumps.
  return <AppShellSkeleton label={t("loading")} sidebarOpen={sidebarOpen} />;
}

/**
 * Chooses the frame of the current page: entry pages (sign-in, invite, sign-up, password reset) render alone and handle
 * their own session states; every other path — the user area and not-found — needs a signed-in
 * session and renders inside the shared `AppLayout` (same widgets as web, no `/admin`).
 */
export function DesktopShell({ sidebar, children }: { sidebar: DesktopApp["sidebar"]; children: ReactNode }) {
  const href = useRouterState({ select: (state) => state.location.href });
  const route = parseRoute(href);
  if (route !== null && ENTRY_ROUTE_IDS.has(route.id)) return children;
  return (
    <UserAreaGate href={href} sidebarOpen={sidebar.defaultOpen}>
      <AppLayout sidebarDefaultOpen={sidebar.defaultOpen} persistSidebarState={sidebar.persist}>
        {children}
      </AppLayout>
    </UserAreaGate>
  );
}
