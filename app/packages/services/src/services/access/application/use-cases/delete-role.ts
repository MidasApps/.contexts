import type { Principal, RoleId } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { RoleInUseError } from "../../domain/errors/role-in-use-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { loadAuthorizedRole } from "./get-role.ts";

export type DeleteRoleCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly roleId: RoleId;
  readonly requestId: string;
};

export type DeleteRoleError = AccessDeniedError | AccessNotFoundError | RoleInUseError;

export type DeleteRole = (command: DeleteRoleCommand) => Promise<Result<void, DeleteRoleError>>;

/**
 * Soft-deletes a custom role (`core.role.delete`). A role that a live grant uses cannot
 * go (409 ROLE_IN_USE); the check and the delete share one transaction.
 */
export const makeDeleteRole =
  (deps: AccessWriteDeps): DeleteRole =>
  async (command) => {
    const loaded = await loadAuthorizedRole(deps, { ...command, permission: "core.role.delete" });
    if (!loaded.ok) return loaded;
    const { tenantId, id } = loaded.data;
    const actor = auditActorOf(command.actor);
    return deps.unitOfWork.run(async (tx): Promise<Result<void, DeleteRoleError>> => {
      const [role, inUse] = await Promise.all([
        deps.roles.get(tx, id),
        deps.memberships.isRoleInUse(tx, { tenantId, roleId: id }),
      ]);
      if (role === null) return err(new AccessNotFoundError("role"));
      if (inUse) return err(new RoleInUseError(id));
      deps.roles.softDelete(tx, { id, deletedAt: deps.clock.now().toISOString(), actorId: actor.id });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId,
          action: "ROLE_DELETED",
          actor,
          target: { type: "role", id },
          node: { level: "organization", tenantId },
          outcome: "success",
          requestId: command.requestId,
        },
        tx,
      );
      return ok(undefined);
    });
  };
