"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useIsImpersonating } from "#/shared/lib/session/use-impersonation.ts";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import {
  SettingsTemplate,
  type SettingsTemplateProps,
} from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

/**
 * Support staff viewing the app as a user (read-only, SP1 spec §6.6): the controls inside are
 * disabled at once by a disabled `fieldset`, instead of saves that always fail. Views wrap only
 * what writes, so retrying a failed load or paging a list keeps working.
 */
export function ReadOnlyFieldset({ children }: { children: ReactNode }) {
  if (!useIsImpersonating()) return children;
  return (
    <fieldset disabled className="min-w-0">
      {children}
    </fieldset>
  );
}

/** The one notice of a profile page while staff view it as the user; nothing otherwise. */
function ImpersonationReadOnlyNotice() {
  const t = useTranslations("profile");
  if (!useIsImpersonating()) return null;
  return (
    <Alert variant="warning" role={undefined}>
      <Icon name="eye" />
      <AlertDescription className="text-inherit">{t("impersonationReadOnly")}</AlertDescription>
    </Alert>
  );
}

/**
 * Frame of every profile page of the administration (decision 0077): header and content; the
 * administration's sidebar lists the profile sections.
 */
export function ProfilePageFrame({
  header,
  width,
  children,
}: {
  header: ReactNode;
  width?: SettingsTemplateProps["width"];
  children: ReactNode;
}) {
  return (
    <SettingsTemplate header={header} width={width}>
      <ImpersonationReadOnlyNotice />
      {children}
    </SettingsTemplate>
  );
}
