import type { TenantId } from "@core/contracts";

/**
 * Name of a live organization, for the invitation preview. Access reads it through this
 * port so it does not depend on the tenancy context.
 */
export type OrganizationDirectory = {
  /** @returns null when the organization does not exist or is deleted. */
  readonly getName: (tenantId: TenantId) => Promise<string | null>;
};
