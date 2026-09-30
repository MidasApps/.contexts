import type { Permission, Principal, Role, RoleId } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { requirePermission } from "../grant-checks.ts";

export type LoadRoleCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly roleId: RoleId;
  /** `core.role.read|update|delete`, checked at the role's organization. */
  readonly permission: Permission;
};

/**
 * Loads a live custom role and authorizes `permission` at its organization. A missing
 * role and a role of an organization the caller cannot see both fail (404 vs denial).
 */
export const loadAuthorizedRole = async (
  deps: Pick<AccessWriteDeps, "roles">,
  command: LoadRoleCommand,
): Promise<Result<Role, AccessNotFoundError | AccessDeniedError>> => {
  const role = await deps.roles.get(undefined, command.roleId);
  if (role === null) return err(new AccessNotFoundError("role"));
  const allowed = await requirePermission({ ...command, node: { level: "organization", tenantId: role.tenantId } });
  return allowed.ok ? ok(role) : allowed;
};

export type GetRole = (command: Omit<LoadRoleCommand, "permission">) => Promise<Result<Role, AccessNotFoundError | AccessDeniedError>>;

/** Reads a custom role (`core.role.read` at its organization). */
export const makeGetRole =
  (deps: Pick<AccessWriteDeps, "roles">): GetRole =>
  (command) =>
    loadAuthorizedRole(deps, { ...command, permission: "core.role.read" });
