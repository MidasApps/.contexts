"use client";

import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { NotificationPreferencesForm } from "#/features/update-preferences/index.ts";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ProfilePageFrame } from "#/widgets/profile-nav/index.ts";

/** `/profile/notifications` (SP2 spec §8): `preferences.notifications.*` toggles. */
export function ProfileNotificationsView() {
  const t = useTranslations("profile.notifications");
  const me = useMe();
  return (
    <ProfilePageFrame header={<PageHeader title={t("title")} description={t("description")} />}>
      <QuerySection query={me} loadingLabel={t("loading")}>
        {(data) => (
          <SectionCard title={t("emailTitle")} description={t("emailDescription")}>
            <NotificationPreferencesForm me={data} />
          </SectionCard>
        )}
      </QuerySection>
    </ProfilePageFrame>
  );
}
