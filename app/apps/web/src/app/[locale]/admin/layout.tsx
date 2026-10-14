import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";
import { cookies } from "next/headers";
import { locale } from "next/root-params";
import { type ReactNode, Suspense } from "react";
import { ShellSkeleton } from "@/client/shell-skeleton";
import { SIDEBAR_COOKIE_NAME, WebAdminLayout } from "@/client/web-layouts";
import { requireWebSession } from "@/server/session-guards";

/** Checks the web session (request-time: cookies) and renders the administration's shell. */
async function SignedInAdminShell({ sidebarOpen, children }: { sidebarOpen: boolean; children: ReactNode }) {
  const segment = await locale();
  await requireWebSession(isSupportedLocale(segment) ? segment : SOURCE_LOCALE);
  return <WebAdminLayout sidebarDefaultOpen={sidebarOpen}>{children}</WebAdminLayout>;
}

/**
 * Reads the sidebar cookie (instant) before the session check (slow), so the skeleton shown while
 * the session is checked already has the user's sidebar width.
 */
async function AdminShellWithSidebarState({ children }: { children: ReactNode }) {
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false";
  return (
    <Suspense fallback={<ShellSkeleton sidebarOpen={sidebarOpen} />}>
      <SignedInAdminShell sidebarOpen={sidebarOpen}>{children}</SignedInAdminShell>
    </Suspense>
  );
}

/**
 * The administration (`/admin`, decision 0077): organization settings, module settings, the
 * profile and the platform console. Any signed-in user may enter (a sign-in started here comes back
 * here through `?next=`); each section authorizes on its own, and `platform/` adds the staff guard.
 */
// Next.js requires the layout as a default export.
export default function AdministrationLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShellWithSidebarState>{children}</AdminShellWithSidebarState>
    </Suspense>
  );
}
