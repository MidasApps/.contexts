import { cookies } from "next/headers";
import { locale } from "next/root-params";
import { Suspense, type ReactNode } from "react";
import { ShellSkeleton } from "@/client/shell-skeleton";
import { SIDEBAR_COOKIE_NAME, WebAdminLayout } from "@/client/web-layouts";
import { requirePlatformStaffSession } from "@/server/session-guards";
import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";

/** Checks the staff session (request-time) and renders the admin shell; non-staff get 404. */
async function StaffShell({ sidebarOpen, children }: { sidebarOpen: boolean; children: ReactNode }) {
  const segment = await locale();
  await requirePlatformStaffSession(isSupportedLocale(segment) ? segment : SOURCE_LOCALE);
  return <WebAdminLayout sidebarDefaultOpen={sidebarOpen}>{children}</WebAdminLayout>;
}

/**
 * Reads the sidebar cookie (instant) before the session check (slow), so the skeleton shown while
 * the session is checked already has the user's sidebar width.
 */
async function StaffShellWithSidebarState({ children }: { children: ReactNode }) {
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false";
  return (
    <Suspense fallback={<ShellSkeleton sidebarOpen={sidebarOpen} />}>
      <StaffShell sidebarOpen={sidebarOpen}>{children}</StaffShell>
    </Suspense>
  );
}

/**
 * `/admin` surface (SP2 spec §7, web only): `requirePlatformStaffSession()` (staff doc + MFA on the
 * session, SP1) before anything renders; a signed-in non-staff user gets 404, not 403. SP5 fills
 * the areas; until then each is an empty state.
 */
// Next.js requires the layout as a default export.
export default function AdminAreaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <StaffShellWithSidebarState>{children}</StaffShellWithSidebarState>
    </Suspense>
  );
}
