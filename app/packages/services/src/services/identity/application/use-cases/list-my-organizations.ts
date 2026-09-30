import { OrganizationIdSchema, type Organization, type UserPrincipal } from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import type { MeDeps } from "../me-deps.ts";

export type ListMyOrganizations = (command: { readonly actor: UserPrincipal; readonly page: PageRequest }) => Promise<Page<Organization>>;

/**
 * `GET /v1/me/organizations`: organizations where the caller holds any live grant. Pages
 * over the caller's live access projections (by tenant id), then reads those organizations;
 * one deleted in between is skipped.
 */
export const makeListMyOrganizations =
  (deps: Pick<MeDeps, "projections" | "organizations">): ListMyOrganizations =>
  async ({ actor, page }) => {
    const projections = await deps.projections.listOfPrincipal({ principalId: actor.uid, page });
    const organizations = await Promise.all(projections.items.map((projection) => deps.organizations.get(undefined, OrganizationIdSchema.parse(projection.tenantId))));
    return { items: organizations.filter((organization) => organization !== null), nextCursor: projections.nextCursor };
  };
