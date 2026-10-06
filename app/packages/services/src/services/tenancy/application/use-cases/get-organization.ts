import type { Organization, OrganizationId, Permission } from "@core/contracts";
import { requirePermission } from "#/services/access/application/grant-checks.ts";
import type { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import { organizationNode, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";

export type OrganizationCommand = Omit<TenancyCommand, "requestId"> & { readonly organizationId: OrganizationId };

export type LoadError = AccessDeniedError | TenancyNotFoundError;

/** Authorizes `permission` at the organization, then loads it (live only). */
export const loadAuthorizedOrganization = async (
  deps: Pick<TenancyDeps, "organizations">,
  command: OrganizationCommand & { readonly permission: Permission },
): Promise<Result<Organization, LoadError>> => {
  const allowed = await requirePermission({ ...command, node: organizationNode(command.organizationId) });
  if (!allowed.ok) return allowed;
  const organization = await deps.organizations.get(undefined, command.organizationId);
  return organization === null ? err(new TenancyNotFoundError("organization")) : ok(organization);
};

export type GetOrganization = (command: OrganizationCommand) => Promise<Result<Organization, LoadError>>;

/** Reads an organization (`core.organization.read`). */
export const makeGetOrganization =
  (deps: Pick<TenancyDeps, "organizations">): GetOrganization =>
  (command) =>
    loadAuthorizedOrganization(deps, { ...command, permission: "core.organization.read" });
