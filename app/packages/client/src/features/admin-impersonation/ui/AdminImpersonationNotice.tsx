"use client";

import { useTranslations } from "use-intl";
import { StatePanel } from "#/shared/ui/molecules/StatePanel/StatePanel.tsx";
import { LeaveImpersonationButton } from "./LeaveImpersonationButton.tsx";

/**
 * What `/admin` shows while the tab is in support mode (follow-up 92): the staff web session
 * passes the server guard, but the tab's ID token is the impersonated user's, so every admin call
 * would fail. The page explains why and offers to leave support mode (decision 0047), which
 * returns the tab to the staff account on `/admin/users`.
 */
export function AdminImpersonationNotice() {
  const t = useTranslations("admin.impersonation.adminBlocked");
  return (
    <>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <StatePanel
        icon="eye"
        tone="amber"
        title={t("title")}
        description={t("description")}
        action={<LeaveImpersonationButton />}
      />
    </>
  );
}
