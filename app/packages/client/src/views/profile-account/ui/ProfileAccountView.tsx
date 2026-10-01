"use client";

import type { Me } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { UpdateProfileForm } from "#/features/update-profile/index.ts";
import { Avatar } from "#/shared/ui/atoms/Avatar/Avatar.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ProfilePageFrame } from "#/widgets/profile-nav/index.ts";

function AccountSections({ me }: { me: Me }) {
  const t = useTranslations("profile.account");
  const name = me.displayName === "" ? me.email : me.displayName;
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title={t("identityTitle")} description={t("identityDescription")}>
        <div className="flex items-center gap-3">
          <Avatar name={name} size="lg" decorative />
          <dl className="flex min-w-0 flex-col gap-0.5">
            <dt className="sr-only">{t("emailLabel")}</dt>
            <dd className="truncate text-sm font-medium">{me.email}</dd>
            <dt className="sr-only">{t("mfaLabel")}</dt>
            <dd>
              <StatusPill tone={me.mfaEnrolled ? "emerald" : "amber"} icon={me.mfaEnrolled ? "circle-check" : "alert-triangle"}>
                {me.mfaEnrolled ? t("mfaOn") : t("mfaOff")}
              </StatusPill>
            </dd>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
      </SectionCard>
      <SectionCard title={t("profileTitle")} description={t("profileDescription")}>
        <UpdateProfileForm me={me} />
      </SectionCard>
    </div>
  );
}

/** `/profile/account` (SP2 spec §8): who the user is (email, MFA state) and the display name. */
export function ProfileAccountView() {
  const t = useTranslations("profile.account");
  const me = useMe();
  return (
    <ProfilePageFrame header={<PageHeader title={t("title")} description={t("description")} />}>
      <QuerySection query={me} loadingLabel={t("loading")}>
        {(data) => <AccountSections me={data} />}
      </QuerySection>
    </ProfilePageFrame>
  );
}
