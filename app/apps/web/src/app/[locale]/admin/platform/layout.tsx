import { isSupportedLocale, SOURCE_LOCALE } from "@core/i18n";
import { locale } from "next/root-params";
import { type ReactNode, Suspense } from "react";
import { requirePlatformStaffSession } from "@/server/session-guards";

/** Checks the staff session (request-time) before the console renders; non-staff get 404. */
async function StaffOnly({ children }: { children: ReactNode }) {
  const segment = await locale();
  await requirePlatformStaffSession(isSupportedLocale(segment) ? segment : SOURCE_LOCALE);
  return children;
}

/**
 * The platform console (`/admin/platform`, SP2 spec §7, web only), inside the administration's
 * shell: `requirePlatformStaffSession()` (staff doc + MFA on the session, SP1) before anything
 * renders; a signed-in user who is not staff gets 404, not 403, so the console does not reveal itself.
 */
// Next.js requires the layout as a default export.
export default function PlatformConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <StaffOnly>{children}</StaffOnly>
    </Suspense>
  );
}
