"use client";

import type { AdminUserSummary } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";
import { adminUserLabel } from "#/entities/admin-user/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { OpenImpersonationSession, StartImpersonationForm, useStoredImpersonation, type ImpersonationTarget } from "#/features/admin-impersonation/index.ts";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminOrganizationFilter, AdminPageFrame } from "#/widgets/admin-nav/index.ts";
import { UserSearchSection } from "./UserSearchSection.tsx";

const targetOf = (user: AdminUserSummary): ImpersonationTarget => ({ id: user.id, label: adminUserLabel(user), detail: user.displayName.trim() === "" ? undefined : (user.email ?? undefined) });

function CurrentSession() {
  const t = useTranslations("admin.users.session");
  const session = useStoredImpersonation();
  const organizations = useAllAdminOrganizations();
  if (session === null) return <EmptyState frame="plain" headingLevel={3} icon="eye-off" title={t("emptyTitle")} description={t("emptyDescription")} />;
  const organizationName = organizations.data?.find((organization) => organization.id === session.organizationId)?.name;
  return <OpenImpersonationSession session={session} organizationName={organizationName} />;
}

function StartSection({ target, onTargetClear }: { target: ImpersonationTarget | undefined; onTargetClear: () => void }) {
  const t = useTranslations("admin.users");
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  return (
    <SectionCard title={t("start.title")} description={t("start.description")}>
      <StartImpersonationForm
        target={target}
        onTargetClear={onTargetClear}
        organizationId={organizationId}
        organizationField={<AdminOrganizationFilter required value={organizationId} onValueChange={setOrganizationId} label={t("start.organization")} />}
      />
    </SectionCard>
  );
}

/**
 * `/admin/users` (SP5 spec §6, platform.user.read): staff find a user by name, email or id
 * (decision 0044) and, with `platform.user.impersonate`, pick one to start SP1's support access —
 * acting as the user in one organization, read-only, for at most an hour, audited in both logs.
 * The session started in this tab stays listed until it is ended or expires.
 */
export function AdminUsersView() {
  const t = useTranslations("admin.users");
  const permissions = usePlatformPermissions();
  const canImpersonate = permissions.can("platform.user.impersonate");
  const [target, setTarget] = useState<ImpersonationTarget | undefined>();
  return (
    <AdminPageFrame permission="platform.user.read" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
          <Alert variant="info" role={undefined}>
            <AlertTitle>{t("notice.title")}</AlertTitle>
            <AlertDescription className="text-inherit">{t("notice.description")}</AlertDescription>
          </Alert>
          <UserSearchSection selectedId={target?.id} onSelect={canImpersonate ? (user) => setTarget(targetOf(user)) : undefined} />
          <SectionCard title={t("session.title")} description={t("session.description")}>
            <CurrentSession />
          </SectionCard>
          {canImpersonate ? <StartSection target={target} onTargetClear={() => setTarget(undefined)} /> : null}
      </div>
    </AdminPageFrame>
  );
}
