"use client";

import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { OpenImpersonationSession, StartImpersonationForm, useStoredImpersonation } from "#/features/admin-impersonation/index.ts";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminOrganizationFilter, AdminPageFrame } from "#/widgets/admin-nav/index.ts";

function CurrentSession() {
  const t = useTranslations("admin.users.session");
  const session = useStoredImpersonation();
  const organizations = useAllAdminOrganizations();
  if (session === null) return <EmptyState frame="plain" headingLevel={3} icon="eye-off" title={t("emptyTitle")} description={t("emptyDescription")} />;
  const organizationName = organizations.data?.find((organization) => organization.id === session.organizationId)?.name;
  return <OpenImpersonationSession session={session} organizationName={organizationName} />;
}

function StartSection() {
  const t = useTranslations("admin.users");
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  return (
    <SectionCard title={t("start.title")} description={t("start.description")}>
      <StartImpersonationForm
        organizationId={organizationId}
        organizationField={<AdminOrganizationFilter required value={organizationId} onValueChange={setOrganizationId} label={t("start.organization")} />}
      />
    </SectionCard>
  );
}

/**
 * `/admin/users` (SP5 spec §6, platform.user.read): the entry to SP1's support access — acting as
 * a user in one organization, read-only, for at most an hour, audited in both logs. No user search
 * endpoint exists yet, so staff give the user id; the page says so. The session started in this
 * tab stays listed until it is ended or expires.
 */
export function AdminUsersView() {
  const t = useTranslations("admin.users");
  const permissions = usePlatformPermissions();
  return (
    <AdminPageFrame permission="platform.user.read" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <Alert variant="info" role={undefined}>
          <AlertTitle>{t("notice.title")}</AlertTitle>
          <AlertDescription className="text-inherit">{t("notice.description")}</AlertDescription>
        </Alert>
        <SectionCard title={t("session.title")} description={t("session.description")}>
          <CurrentSession />
        </SectionCard>
        {permissions.can("platform.user.impersonate") ? <StartSection /> : null}
      </div>
    </AdminPageFrame>
  );
}
