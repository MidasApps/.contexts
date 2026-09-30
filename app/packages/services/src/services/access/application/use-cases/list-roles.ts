import type { Principal, Role, TenantId } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { requirePermission } from "../grant-checks.ts";

export type ListRolesCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly page: PageRequest;
};

export type ListRoles = (command: ListRolesCommand) => Promise<Result<Page<Role>, AccessDeniedError>>;

/** Lists the live custom roles of an organization by name (`core.role.read`). */
export const makeListRoles =
  (deps: Pick<AccessWriteDeps, "roles">): ListRoles =>
  async (command) => {
    const node = { level: "organization", tenantId: command.tenantId } as const;
    const allowed = await requirePermission({ ...command, permission: "core.role.read", node });
    if (!allowed.ok) return allowed;
    return ok(await deps.roles.list({ tenantId: command.tenantId, page: command.page }));
  };
