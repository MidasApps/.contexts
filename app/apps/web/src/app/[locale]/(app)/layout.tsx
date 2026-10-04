import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";
import { cookies } from "next/headers";
import { locale } from "next/root-params";
import { type ReactNode, Suspense } from "react";
import { ShellSkeleton } from "@/client/shell-skeleton";
import { SIDEBAR_COOKIE_NAME, WebAppLayout } from "@/client/web-layouts";
import { requireWebSession } from "@/server/session-guards";

/** Checks the web session (request-time: cookies) and renders the user area's shell. */
async function SignedInShell({ sidebarOpen, children }: { sidebarOpen: boolean; children: ReactNode }) {
  const segment = await locale();
  await requireWebSession(isSupportedLocale(segment) ? segment : SOURCE_LOCALE);
  return <WebAppLayout sidebarDefaultOpen={sidebarOpen}>{children}</WebAppLayout>;
}

/**
 * Reads the sidebar cookie (instant) before the session check (slow), so the skeleton shown while
 * the session is checked already has the user's sidebar width.
 */
async function SignedInShellWithSidebarState({ children }: { children: ReactNode }) {
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false";
  return (
    <Suspense fallback={<ShellSkeleton sidebarOpen={sidebarOpen} />}>
      <SignedInShell sidebarOpen={sidebarOpen}>{children}</SignedInShell>
    </Suspense>
  );
}

/**
 * User area (SP2 spec §7, §10): guarded on the server by `requireWebSession()` inside
 * `<Suspense>` (Cache Components), so the static shell streams while the session is checked.
 */
// Next.js requires the layout as a default export.
export default function UserAreaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShellWithSidebarState>{children}</SignedInShellWithSidebarState>
    </Suspense>
  );
}
