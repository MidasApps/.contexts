// Test world of the tenancy use cases: the access write world (in-memory grants and
// projections) plus in-memory tenancy repositories mirrored into its access store.
import {
  OrganizationIdSchema,
  ProjectIdSchema,
  type TenantId,
  UnitIdSchema,
  type UnitTypeDefinition,
  UserIdSchema,
  type UserPrincipal,
} from "@core/contracts";
import { makeAccessWriteWorld, REQUEST_ID } from "../../../access/application/use-cases/access-write.fixture.ts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { createInMemoryTenancyStore } from "../../adapters/driven/in-memory-tenancy-store.ts";
import { createTenancyServices } from "../../composition.ts";

export { REQUEST_ID };

export const UNIT_TYPES: UnitTypeDefinition[] = [
  { id: "sample.site", labelKey: "sample.unitTypes.site", allowedParents: ["project"] },
  { id: "sample.room", labelKey: "sample.unitTypes.room", allowedParents: ["sample.site", "sample.room"] },
];

export const DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" };

export const userOf = (uid: string): UserPrincipal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });

export const ids = {
  tenant: (value: string): TenantId => OrganizationIdSchema.parse(value),
  project: (value: string) => ProjectIdSchema.parse(value),
  unit: (value: string) => UnitIdSchema.parse(value),
};

/** A fresh world; `selfServe` defaults to true. Accounts exist for every uid. */
export const makeTenancyWorld = (options: { selfServe?: boolean; clock?: Clock } = {}) => {
  const world = makeAccessWriteWorld();
  const tenancyStore = createInMemoryTenancyStore(world.store);
  const tenancy = createTenancyServices({
    unitTypes: UNIT_TYPES,
    organizations: tenancyStore.organizations,
    projects: tenancyStore.projects,
    units: tenancyStore.units,
    treeLocks: tenancyStore.treeLocks,
    access: world.services,
    accounts: { getProfile: (uid) => Promise.resolve({ email: `${uid}@example.com`, displayName: uid }) },
    audit: world.deps.audit,
    unitOfWork: world.deps.unitOfWork,
    clock: options.clock ?? world.deps.clock,
    selfServe: options.selfServe ?? true,
  });
  const command = (uid: string) => ({ actor: userOf(uid), access: world.access(), requestId: REQUEST_ID });
  /** Creates an organization owned by `uid` and marks the owner active for `authorize()`. */
  const organizationOf = async (uid: string, name = "Northwind") => {
    world.store.putUser(uid);
    const created = await tenancy.createOrganization({ ...command(uid), input: { name, defaults: DEFAULTS } });
    if (!created.ok) throw created.error;
    return created.data;
  };
  return { ...world, tenancyStore, tenancy, command, organizationOf };
};
