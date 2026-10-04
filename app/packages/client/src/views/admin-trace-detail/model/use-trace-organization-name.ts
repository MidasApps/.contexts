"use client";

import { useTranslations } from "use-intl";
import { useAllAdminOrganizations } from "#/entities/admin-organization/index.ts";

/**
 * The name of the organization a trace belongs to: "platform" for a trace without a tenant, the
 * organization's name once the list is read (`enabled`), else its id.
 */
export const useTraceOrganizationName = (tenantId: string | null | undefined, enabled: boolean): string => {
  const t = useTranslations("admin.traces");
  const organizations = useAllAdminOrganizations({ enabled });
  if (tenantId === null || tenantId === undefined) return t("platform");
  return organizations.data?.find((organization) => organization.id === tenantId)?.name ?? tenantId;
};
