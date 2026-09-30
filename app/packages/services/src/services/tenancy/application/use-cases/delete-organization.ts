import type { TenantId } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { TenancyNotFoundError } from "../../domain/errors/tenancy-not-found-error.ts";
import { organizationNode, recordTenancyAudit, type TenancyCommand, type TenancyDeps } from "../tenancy-deps.ts";
import { loadAuthorizedOrganization, type LoadError, type OrganizationCommand } from "./get-organization.ts";

export type DeleteOrganizationCommand = OrganizationCommand & TenancyCommand;

export type DeleteOrganization = (command: DeleteOrganizationCommand) => Promise<Result<void, LoadError>>;

/** Projections revoked per batch (well under a transaction's write limit). */
const REVOKE_BATCH = 400;

// Revokes live projections in batches until none is left; re-running is safe.
const revokeProjections = async (deps: TenancyDeps, tenantId: TenantId, actorId: string, now: string): Promise<void> => {
  for (;;) {
    const batch = await deps.access.projections.listUnrevoked(undefined, { tenantId, limit: REVOKE_BATCH });
    if (batch.length === 0) return;
    await deps.access.projections.markRevoked(undefined, { projections: batch, updatedAt: now, actorId });
  }
};

/**
 * Soft-deletes an organization (`core.organization.delete`, owners) and revokes every
 * access projection of the tenant (SP1 spec §6.1). Projections are revoked first in
 * batches, so a failure leaves the organization alive and a retry finishes the job; the
 * transaction then revokes any projection a concurrent grant rebuilt and deletes.
 */
export const makeDeleteOrganization =
  (deps: TenancyDeps): DeleteOrganization =>
  async (command) => {
    const loaded = await loadAuthorizedOrganization(deps, { ...command, permission: "core.organization.delete" });
    if (!loaded.ok) return loaded;
    const { tenantId } = loaded.data;
    const actorId = auditActorOf(command.actor).id;
    const now = deps.clock.now().toISOString();
    await revokeProjections(deps, tenantId, actorId, now);
    return deps.unitOfWork.run(async (tx): Promise<Result<void, LoadError>> => {
      const [current, stragglers] = await Promise.all([
        deps.organizations.get(tx, command.organizationId),
        deps.access.projections.listUnrevoked(tx, { tenantId, limit: REVOKE_BATCH }),
      ]);
      if (current === null) return err(new TenancyNotFoundError("organization"));
      await deps.access.projections.markRevoked(tx, { projections: stragglers, updatedAt: now, actorId });
      deps.organizations.softDelete(tx, { id: current.id, deletedAt: now, actorId });
      await recordTenancyAudit(tx, deps, command, { tenantId, action: "ORGANIZATION_DELETED", target: { type: "organization", id: tenantId }, node: organizationNode(tenantId) });
      return ok(undefined);
    });
  };
