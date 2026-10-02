"use client";

import { useTranslations } from "use-intl";
import { useMe } from "#/entities/session/index.ts";
import { RegionalPreferencesForm, ThemePreferenceField } from "#/features/update-preferences/index.ts";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QuerySection } from "#/widgets/page-state/index.ts";
import { ProfilePageFrame, ReadOnlyFieldset } from "#/widgets/profile-nav/index.ts";

/**
 * `/profile/preferences` (SP2 spec §8): language, time zone and currency (saved together; a new
 * language switches the page in place), and the theme (applied as soon as it is picked).
 */
export function ProfilePreferencesView() {
  const t = useTranslations("profile.preferences");
  const me = useMe();
  return (
    <ProfilePageFrame header={<PageHeader title={t("title")} description={t("description")} />}>
      <QuerySection query={me} loadingLabel={t("loading")}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <SectionCard title={t("regional.title")} description={t("regional.description")}>
              <ReadOnlyFieldset>
                <RegionalPreferencesForm me={data} />
              </ReadOnlyFieldset>
            </SectionCard>
            <SectionCard title={t("theme.title")}>
              <ReadOnlyFieldset>
                <ThemePreferenceField />
              </ReadOnlyFieldset>
            </SectionCard>
          </div>
        )}
      </QuerySection>
    </ProfilePageFrame>
  );
}
