"use client";

import { useTranslations } from "use-intl";
import { ChangePasswordForm, type MfaStepProps } from "#/features/change-password/index.ts";
import { MfaChallengeForm } from "#/features/mfa-challenge/index.ts";
import { MfaFactorsSection } from "#/features/mfa-enrollment/index.ts";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { ProfilePageFrame } from "#/widgets/profile-nav/index.ts";

/** The sign-in MFA form reused to confirm a sensitive change. */
function ReauthMfaStep({ challenge, onResolved, onCancel }: MfaStepProps) {
  const t = useTranslations("profile.security.password");
  return <MfaChallengeForm challenge={challenge} onResolved={onResolved} onCancel={onCancel} cancelLabel={t("cancelMfa")} />;
}

/**
 * `/profile/security` (SP2 spec §8): second factors (enroll TOTP/SMS per the environment,
 * remove) and the password change, which re-authenticates — with the second factor when one is
 * enrolled (the sign-in MFA form, in a dialog).
 */
export function ProfileSecurityView() {
  const t = useTranslations("profile.security");
  return (
    <ProfilePageFrame header={<PageHeader title={t("title")} description={t("description")} />}>
      <div className="flex flex-col gap-6">
        <SectionCard title={t("mfa.title")} description={t("mfa.description")}>
          <MfaFactorsSection />
        </SectionCard>
        <SectionCard title={t("password.title")} description={t("password.description")}>
          <ChangePasswordForm MfaStep={ReauthMfaStep} />
        </SectionCard>
      </div>
    </ProfilePageFrame>
  );
}
