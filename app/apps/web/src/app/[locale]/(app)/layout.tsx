import { cookies } from "next/headers";
import { locale } from "next/root-params";
import { Suspense, type ReactNode } from "react";
import { ShellSkeleton } from "@/client/shell-skeleton";
import { SIDEBAR_COOKIE_NAME, WebAppLayout } from "@/client/web-layouts";
import { requireWebSession } from "@/server/session-guards";
import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";

/** Checks the web session (request-time: cookies) and renders the user area's shell. */
async function SignedInShell({ children }: { children: ReactNode }) {
  const segment = await locale();
  await requireWebSession(isSupportedLocale(segment) ? segment : SOURCE_LOCALE);
  const sidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false";
  return <WebAppLayout sidebarDefaultOpen={sidebarOpen}>{children}</WebAppLayout>;
}

/**
 * User area (SP2 spec §7, §10): guarded on the server by `requireWebSession()` inside
 * `<Suspense>` (Cache Components), so the static shell streams while the session is checked.
 */
// Next.js requires the layout as a default export.
export default function UserAreaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}
