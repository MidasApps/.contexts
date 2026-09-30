import type { Membership, Principal, TenantId } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { requirePermission } from "../grant-checks.ts";

export type ListMembershipsCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly principalId?: string | undefined;
  readonly page: PageRequest;
};

export type ListMemberships = (command: ListMembershipsCommand) => Promise<Result<Page<Membership>, AccessDeniedError>>;

/** Live grants of an organization, oldest first (`core.member.read` at the organization). */
export const makeListMemberships =
  (deps: Pick<AccessWriteDeps, "memberships">): ListMemberships =>
  async (command) => {
    const { tenantId, principalId, page } = command;
    const allowed = await requirePermission({ ...command, permission: "core.member.read", node: { level: "organization", tenantId } });
    if (!allowed.ok) return allowed;
    return ok(await deps.memberships.list({ tenantId, principalId, page }));
  };
