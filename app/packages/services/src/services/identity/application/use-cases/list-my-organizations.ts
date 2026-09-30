import { OrganizationIdSchema, type Organization, type UserPrincipal } from "@core/contracts";
import type { RequestAccess } from "../../../access/composition.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import type { MeDeps } from "../me-deps.ts";

export type ListMyOrganizations = (command: { readonly actor: UserPrincipal; readonly access: RequestAccess; readonly page: PageRequest }) => Promise<Page<Organization>>;

type Deps = Pick<MeDeps, "projections" | "organizations" | "membership">;

/**
 * Whether the caller still holds a live grant in the organization. The projection stays live
 * for a grant whose node was deleted since, so the grants decide (decision 0030 A5). A
 * suspended organization stays listed: its members see it, and switching answers 403.
 */
const isLiveMember = async (deps: Deps, args: { actor: UserPrincipal; access: RequestAccess; organization: Organization }): Promise<boolean> => {
  const member = await deps.membership.requireOrganizationMember({ access: args.access, actor: args.actor, tenantId: args.organization.id });
  return member.ok || member.error.reason === "ORGANIZATION_SUSPENDED";
};

/**
 * `GET /v1/me/organizations`: organizations where the caller holds a live grant on a live
 * node. Pages over the caller's live access projections (by tenant id), reads those
 * organizations, and skips one deleted in between or whose grants all sit on deleted nodes
 * (so a page may hold fewer items than its limit). A reader error rejects (fail-closed).
 */
export const makeListMyOrganizations =
  (deps: Deps): ListMyOrganizations =>
  async ({ actor, access, page }) => {
    const projections = await deps.projections.listOfPrincipal({ principalId: actor.uid, page });
    const organizations = await Promise.all(projections.items.map((projection) => deps.organizations.get(undefined, OrganizationIdSchema.parse(projection.tenantId))));
    const existing = organizations.filter((organization) => organization !== null);
    const live = await Promise.all(existing.map((organization) => isLiveMember(deps, { actor, access, organization })));
    return { items: existing.filter((_, index) => live[index]), nextCursor: projections.nextCursor };
  };
