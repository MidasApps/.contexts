import { AppLayout } from "@core/client/app-shell";
import { parseRoute, useRouter } from "@core/client/shared/lib/router";
import { useSession, type SessionState } from "@core/client/shared/lib/session";
import { LoadingState } from "@core/client/shared/ui/molecules/LoadingState/LoadingState";
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

const ENTRY_ROUTE_IDS = new Set(["sign-in", "invite"]);

function UserAreaGate({ href, children }: { href: string; children: ReactNode }) {
  const t = useTranslations("auth.signIn");
  const { state } = useSession();
  const router = useRouter();
  const access = userAreaAccess(state.status);
  useEffect(() => {
    // `next` brings the user back here after signing in (only internal routes are honoured).
    if (access === "sign-in") router.navigate({ id: "sign-in", next: href }, { replace: true });
  }, [access, href, router]);
  if (access === "allow") return children;
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <LoadingState variant="spinner" label={t("loading")} />
    </main>
  );
}

/**
 * Chooses the frame of the current page: entry pages (sign-in, invite) render alone and handle
 * their own session states; every other path — the user area and not-found — needs a signed-in
 * session and renders inside the shared `AppLayout` (same widgets as web, no `/admin`).
 */
export function DesktopShell({ sidebar, children }: { sidebar: DesktopApp["sidebar"]; children: ReactNode }) {
  const href = useRouterState({ select: (state) => state.location.href });
  const route = parseRoute(href);
  if (route !== null && ENTRY_ROUTE_IDS.has(route.id)) return children;
  return (
    <UserAreaGate href={href}>
      <AppLayout sidebarDefaultOpen={sidebar.defaultOpen} persistSidebarState={sidebar.persist}>
        {children}
      </AppLayout>
    </UserAreaGate>
  );
}
