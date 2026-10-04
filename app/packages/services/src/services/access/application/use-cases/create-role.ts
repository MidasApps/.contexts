import { type CreateRoleInput, OrganizationIdSchema, type Principal, type Role, type TenantId } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { EscalationForbiddenError } from "../../domain/errors/escalation-forbidden-error.ts";
import { UnknownPermissionError } from "../../domain/errors/unknown-permission-error.ts";
import { unknownTenantPermissions } from "../../domain/role-permissions.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { requireNoEscalation, requirePermission } from "../grant-checks.ts";

export type RolePermissionError = AccessDeniedError | EscalationForbiddenError | UnknownPermissionError;

/**
 * The permissions of a custom role must be registered tenant permissions (422) that the
 * actor holds at the organization (403 ESCALATION_FORBIDDEN, SP1 spec §5.3).
 */
export const checkRolePermissions = async (
  deps: Pick<AccessWriteDeps, "registry">,
  args: { access: RequestAccess; actor: Principal; tenantId: TenantId; permissions: readonly string[] },
): Promise<Result<void, RolePermissionError>> => {
  const unknown = unknownTenantPermissions(args.permissions, deps.registry);
  if (unknown.length > 0) return err(new UnknownPermissionError(unknown));
  return requireNoEscalation({
    ...args,
    node: { level: "organization", tenantId: args.tenantId },
    requested: args.permissions,
  });
};

export type CreateRoleCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly input: CreateRoleInput;
  readonly requestId: string;
};

export type CreateRole = (command: CreateRoleCommand) => Promise<Result<Role, RolePermissionError>>;

/** Creates a custom role (`core.role.create` at the organization) with an audit entry. */
export const makeCreateRole =
  (deps: AccessWriteDeps): CreateRole =>
  async (command) => {
    const tenantId = OrganizationIdSchema.parse(command.tenantId);
    const node = { level: "organization", tenantId } as const;
    const allowed = await requirePermission({ ...command, permission: "core.role.create", node });
    if (!allowed.ok) return allowed;
    const checked = await checkRolePermissions(deps, { ...command, permissions: command.input.permissions });
    if (!checked.ok) return checked;
    const now = deps.clock.now().toISOString();
    const role: Role = {
      id: deps.roles.newId(),
      tenantId,
      ...command.input,
      permissions: [...command.input.permissions],
      createdAt: now,
      updatedAt: now,
    };
    const actor = auditActorOf(command.actor);
    await deps.unitOfWork.run(async (tx) => {
      deps.roles.create(tx, { role, actorId: actor.id });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId,
          action: "ROLE_CREATED",
          actor,
          target: { type: "role", id: role.id },
          node,
          outcome: "success",
          requestId: command.requestId,
        },
        tx,
      );
    });
    return ok(role);
  };
