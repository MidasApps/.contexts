import type { MyGrant, TenantId, UserPrincipal } from "@core/contracts";
import { LEVEL_ORDER } from "../../../access/application/organization-membership.ts";
import type { RequestAccess } from "../../../access/composition.ts";
import { nodeIdOf } from "../../../access/domain/access-projection.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { type Page, type PageRequest, paginateInMemory } from "../../../shared/pagination/page.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import type { MeDeps } from "../me-deps.ts";

export type ListMyGrants = (command: {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly organizationId: TenantId;
  readonly page: PageRequest;
}) => Promise<Result<Page<MyGrant>, AccessDeniedError>>;

/**
 * `GET /v1/me/grants` (follow-up #33, decision 0030 A7): the live nodes where the caller holds
 * grants in the organization, widest first, so the client lands a unit-only member on its
 * unit. Self only: it reads the caller's own grants. Without any live grant it answers the
 * same denial as switching to the organization (404, or 403 when suspended).
 */
export const makeListMyGrants =
  (deps: Pick<MeDeps, "membership">): ListMyGrants =>
  async ({ actor, access, organizationId, page }) => {
    const nodes = await deps.membership.listLiveGrantNodes({ access, actor, tenantId: organizationId });
    if (!nodes.ok) return nodes;
    return ok(
      paginateInMemory({
        items: nodes.data,
        page,
        positionOf: ({ node }) => [String(LEVEL_ORDER[node.level]), nodeIdOf(node)],
      }),
    );
  };
