"use client";

import { useCallback } from "react";
import { useTranslations } from "use-intl";
import { useAdminUserNames } from "#/entities/admin-user/index.ts";
import { AUDIT_LOG_PAGE_LIMIT, usePlatformAuditLog } from "#/entities/audit-log/index.ts";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { AdminPageFrame, useAdminSearch } from "#/widgets/admin-nav/index.ts";
import { AuditActionFilter, AuditLogTable, type AuditRow, auditActionOf } from "#/widgets/audit-log-table/index.ts";

/** The organization a staff action touched, linked to its console page, or "platform-wide". */
function Organization({ entry }: { entry: AuditRow }) {
  const t = useTranslations("admin.auditLog");
  const tenantId = "targetTenantId" in entry ? entry.targetTenantId : undefined;
  if (tenantId === undefined) return <span className="text-muted-foreground">{t("platformWide")}</span>;
  return (
    <RouteLink to={{ id: "admin", rest: `organizations/${tenantId}` }} className="font-mono text-caption">
      {tenantId}
    </RouteLink>
  );
}

/**
 * `/admin/audit` (platform.audit-log.read, both staff roles): what staff did across the platform —
 * plans, budgets, flags, models, support access, refused attempts — newest first, filtered by action
 * (`?action=`) and by organization (`?organizationId=`, set from an organization's link).
 */
export function AdminAuditLogView() {
  const t = useTranslations("admin.auditLog");
  const permissions = usePlatformPermissions();
  const search = useAdminSearch(["action", "organizationId"]);
  const action = auditActionOf(search.values.action);
  const organizationId = search.values.organizationId;
  const entries = usePlatformAuditLog(
    { action, organizationId },
    { enabled: permissions.can("platform.audit-log.read") },
  );
  const userLabel = useAdminUserNames(
    (entries.data ?? []).flatMap((entry) => [entry.actor.id, entry.actor.onBehalfOf]),
    { enabled: permissions.can("platform.user.read") },
  );
  const nameOf = useCallback(
    (uid: string) => {
      const label = userLabel(uid);
      return label === uid ? undefined : label;
    },
    [userLabel],
  );
  return (
    <AdminPageFrame permission="platform.audit-log.read" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <AuditActionFilter value={action} onChange={(next) => search.set({ action: next })} />
        {organizationId === undefined ? null : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t("organizationFilter")} <span className="font-mono text-caption">{organizationId}</span>
            <Button variant="link" size="sm" onClick={() => search.set({ organizationId: undefined })}>
              {t("clearOrganization")}
            </Button>
          </p>
        )}
        <AuditLogTable
          caption={t("caption")}
          entries={entries}
          pageLimit={AUDIT_LOG_PAGE_LIMIT}
          nameOf={nameOf}
          organizationOf={(entry) => <Organization entry={entry} />}
          filtered={action !== undefined || organizationId !== undefined}
        />
      </div>
    </AdminPageFrame>
  );
}
