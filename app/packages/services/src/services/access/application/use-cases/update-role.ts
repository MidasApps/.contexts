import type { Principal, Role, RoleId, UpdateRoleInput } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { checkRolePermissions, type RolePermissionError } from "./create-role.ts";
import { loadAuthorizedRole } from "./get-role.ts";

export type UpdateRoleCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly roleId: RoleId;
  readonly input: UpdateRoleInput;
  readonly requestId: string;
};

export type UpdateRole = (command: UpdateRoleCommand) => Promise<Result<Role, RolePermissionError | AccessNotFoundError>>;

const changedFields = (role: Role, input: UpdateRoleInput): string[] =>
  (["name", "description", "permissions"] as const).filter(
    (field) => input[field] !== undefined && JSON.stringify(input[field]) !== JSON.stringify(role[field]),
  );

/**
 * Changes a custom role (`core.role.update`); a new permission set is checked like on
 * create. Holders' access changes with it (`authorize()` reads roles from the source).
 */
export const makeUpdateRole =
  (deps: AccessWriteDeps): UpdateRole =>
  async (command) => {
    const loaded = await loadAuthorizedRole(deps, { ...command, permission: "core.role.update" });
    if (!loaded.ok) return loaded;
    const role = loaded.data;
    const { permissions } = command.input;
    if (permissions !== undefined) {
      const checked = await checkRolePermissions(deps, { ...command, tenantId: role.tenantId, permissions });
      if (!checked.ok) return checked;
    }
    const next: Role = {
      ...role,
      ...(command.input.name === undefined ? {} : { name: command.input.name }),
      ...(command.input.description === undefined ? {} : { description: command.input.description }),
      ...(permissions === undefined ? {} : { permissions: [...permissions] }),
      updatedAt: deps.clock.now().toISOString(),
    };
    const actor = auditActorOf(command.actor);
    await deps.unitOfWork.run(async (tx) => {
      deps.roles.update(tx, { role: next, actorId: actor.id });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId: role.tenantId,
          action: "ROLE_UPDATED",
          actor,
          target: { type: "role", id: role.id },
          node: { level: "organization", tenantId: role.tenantId },
          outcome: "success",
          requestId: command.requestId,
          changes: changedFields(role, command.input),
        },
        tx,
      );
    });
    return ok(next);
  };
