import type { TenantId } from "@core/contracts";

/**
 * Name and default locale of a live organization, for invitations (preview, accept link).
 * Access reads them through this port so it does not depend on the tenancy context.
 */
export type OrganizationDirectory = {
  /** @returns null when the organization does not exist or is deleted. */
  readonly getName: (tenantId: TenantId) => Promise<string | null>;
  /** `defaults.locale`. @returns null when the organization does not exist or is deleted. */
  readonly getDefaultLocale: (tenantId: TenantId) => Promise<string | null>;
};
