"use client";

import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { LeaveImpersonationButton, useStoredImpersonation, type StoredImpersonation } from "#/features/admin-impersonation/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useImpersonationSessionId } from "#/shared/lib/session/use-impersonation.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";

/**
 * The banner's sentence: whom staff act as (the signed-in user is the impersonated one), in which
 * organization and until when (both known when this tab started the session), or the generic
 * wording while the user cannot be read. `null` while the user still loads, so the live region
 * announces one complete sentence instead of two.
 */
const useBannerMessage = (stored: StoredImpersonation | undefined): string | null => {
  const t = useTranslations("admin.impersonation.banner");
  const formatDateTime = useFormatDateTime();
  const me = useMe();
  if (me.isPending) return null;
  const when = stored === undefined ? undefined : formatDateTime(stored.expiresAt);
  if (me.data === undefined) return when === undefined ? t("message") : t("messageUntil", { when });
  const user = me.data.displayName.trim() === "" ? me.data.email : me.data.displayName;
  if (when === undefined) return t("messageNamed", { user });
  const organization = stored?.organizationName;
  return organization === undefined ? t("messageNamedUntil", { user, when }) : t("messageNamedIn", { user, organization, when });
};

function BannerNotice({ stored }: { stored: StoredImpersonation | undefined }) {
  const message = useBannerMessage(stored);
  if (message === null) return null;
  // Opaque surface: the layout pins the banner under the topbar while the page scrolls beneath it.
  return (
    <div className="rounded-md bg-background">
      <Alert variant="warning" role={undefined} className="items-center">
        <Icon name="eye" />
        <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-inherit">
          <span>{message}</span>
          <LeaveImpersonationButton />
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Banner of the user area while the tab is signed in as an impersonated user (the ID token carries
 * `imp`, SP1 spec §6.6): whom staff see the app as, that the access is read-only and audited,
 * until when it lasts (known when this tab started the session) and "leave support mode", which
 * ends it and returns to the staff account (decision 0047). The region stays mounted so the
 * notice is announced when it appears; empty otherwise.
 */
export function ImpersonationBanner({ className }: { className?: string }) {
  const sessionId = useImpersonationSessionId();
  const stored = useStoredImpersonation();
  const known = stored !== null && stored.sessionId === sessionId ? stored : undefined;
  return (
    <div aria-live="polite" aria-atomic="true" data-slot="impersonation-banner" className={className}>
      {sessionId === null ? null : <BannerNotice stored={known} />}
    </div>
  );
}
