import type { OrganizationId, UserPrincipal } from "@core/contracts";
import type { RequestAccess } from "../../../access/composition.ts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { MeDeps } from "../me-deps.ts";

export type SetActiveOrganizationCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly organizationId: OrganizationId;
  readonly requestId: string;
};

export type SetActiveOrganization = (command: SetActiveOrganizationCommand) => Promise<Result<void, AccessDeniedError>>;

/**
 * `PUT /v1/me/active-organization` (SP1 spec §5.4, decision 0030 A5): the caller must be a
 * live member, with any live grant in the organization's tree (a project- or unit-only member
 * qualifies; switching grants nothing); writes `lastContext`, audits
 * `ACTIVE_ORGANIZATION_CHANGED` and syncs claims, so the next ID token carries `tenantId`.
 * The API never trusts that claim; it is a projection for Security Rules. Refused under
 * impersonation.
 */
export const makeSetActiveOrganization =
  (deps: Pick<MeDeps, "users" | "membership" | "audit" | "unitOfWork" | "clock" | "syncClaims">): SetActiveOrganization =>
  async (command) => {
    const { actor, organizationId } = command;
    if (actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
    const node = { level: "organization" as const, tenantId: organizationId };
    const allowed = await deps.membership.requireOrganizationMember({ access: command.access, actor, tenantId: organizationId });
    if (!allowed.ok) return allowed;
    const updatedAt = deps.clock.now().toISOString();
    await deps.unitOfWork.run(async (tx) => {
      deps.users.setActiveOrganization(tx, { uid: actor.uid, organizationId, updatedAt, actorId: actor.uid });
      await deps.audit.record(
        { log: "tenant", tenantId: organizationId, action: "ACTIVE_ORGANIZATION_CHANGED", actor: auditActorOf(actor), target: { type: "user", id: actor.uid }, node, outcome: "success", requestId: command.requestId },
        tx,
      );
    });
    // A failed sync is logged by syncClaims and healed by POST /v1/me/claims/sync.
    await deps.syncClaims(actor.uid);
    return ok(undefined);
  };
