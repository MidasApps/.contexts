// Composition root of the identity `/v1/me*` vertical (SP1 Task 12) and of the SP3 hook
// `resolveAccessContext`. Principal resolution (Task 8) is wired by `createCoreServer`.
import type { SyncClaims } from "../access/application/use-cases/sync-claims.ts";
import type { MeDeps } from "./application/me-deps.ts";
import { makeGetMe, type GetMe } from "./application/use-cases/get-me.ts";
import { makeListMyOrganizations, type ListMyOrganizations } from "./application/use-cases/list-my-organizations.ts";
import {
  makeLoadAccessContext,
  makeResolveAccessContext,
  type LoadAccessContext,
  type ResolveAccessContext,
} from "./application/use-cases/resolve-access-context.ts";
import { makeSetActiveOrganization, type SetActiveOrganization } from "./application/use-cases/set-active-organization.ts";
import { makeUpdateMe, type UpdateMe } from "./application/use-cases/update-me.ts";

export type IdentityServices = {
  readonly getMe: GetMe;
  readonly updateMe: UpdateMe;
  readonly setActiveOrganization: SetActiveOrganization;
  /** Rewrites the caller's claims from the source (`POST /v1/me/claims/sync`). */
  readonly syncClaims: SyncClaims;
  readonly listMyOrganizations: ListMyOrganizations;
  /** `GET /v1/me/context`, inside the request's scope. */
  readonly loadAccessContext: LoadAccessContext;
  /** SP3 hook (SP1 spec §10): a fresh request scope per call. */
  readonly resolveAccessContext: ResolveAccessContext;
};

/** Binds the me use cases to their adapters (Firestore in `createCoreServer`, fakes in tests). */
export const createIdentityServices = (deps: MeDeps): IdentityServices => ({
  getMe: makeGetMe(deps),
  updateMe: makeUpdateMe(deps),
  setActiveOrganization: makeSetActiveOrganization(deps),
  syncClaims: deps.syncClaims,
  listMyOrganizations: makeListMyOrganizations(deps),
  loadAccessContext: makeLoadAccessContext(deps),
  resolveAccessContext: makeResolveAccessContext(deps),
});
