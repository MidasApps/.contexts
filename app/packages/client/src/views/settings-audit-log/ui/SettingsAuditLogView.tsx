"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { AUDIT_LOG_PAGE_LIMIT, useAuditLog } from "#/entities/audit-log/index.ts";
import { useMemberNames } from "#/entities/member/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useSettingsSearch } from "#/shared/lib/router/use-route-search.ts";
import { AuditActionFilter, AuditLogTable, auditActionOf } from "#/widgets/audit-log-table/index.ts";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

function OrganizationAuditLog({
  context,
  action,
}: {
  context: AccessContext;
  action: ReturnType<typeof auditActionOf>;
}) {
  const t = useTranslations("settings.auditLog");
  const { organization } = context;
  const entries = useAuditLog(organization.id, { action });
  const nameOf = useMemberNames({
    organizationId: organization.id,
    canReadMembers: context.permissions.includes("core.member.read"),
  });
  return (
    <AuditLogTable
      caption={t("caption", { organization: organization.name })}
      entries={entries}
      pageLimit={AUDIT_LOG_PAGE_LIMIT}
      nameOf={nameOf}
      filtered={action !== undefined}
    />
  );
}

function SettingsAuditLog({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.auditLog");
  const { organization } = context;
  const search = useSettingsSearch(["action"]);
  const action = auditActionOf(search.values.action);
  return (
    <SettingsPageFrame
      width="wide"
      organizationId={organization.id}
      allowed={context.permissions.includes("core.audit-log.read")}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <AuditActionFilter value={action} onChange={(next) => search.set({ action: next })} />
        <OrganizationAuditLog context={context} action={action} />
      </div>
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/audit-log` (core.audit-log.read): who did what in the organization,
 * newest first, filtered by action (kept in the URL). Entries list changed field names, never
 * values; member names show when the viewer may list members (core.member.read).
 */
export function SettingsAuditLogView() {
  const t = useTranslations("settings.auditLog");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsAuditLog context={data} />}
    </QueryPage>
  );
}
