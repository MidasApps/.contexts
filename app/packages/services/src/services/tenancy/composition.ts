// Composition root of the tenancy context: organizations, projects, the unit tree and
// regional settings. The unit type registry is built once: the core's types, then the modules'.
import type { UnitTypeDefinition } from "@core/contracts";
import type { TenancyDeps } from "./application/tenancy-deps.ts";
import {
  type CreateOrganization,
  type MayCreateOrganization,
  makeCreateOrganization,
  makeMayCreateOrganization,
} from "./application/use-cases/create-organization.ts";
import { type CreateUnit, makeCreateUnit } from "./application/use-cases/create-unit.ts";
import { type DeleteOrganization, makeDeleteOrganization } from "./application/use-cases/delete-organization.ts";
import { type GetOrganization, makeGetOrganization } from "./application/use-cases/get-organization.ts";
import { type ListProjects, makeListProjects } from "./application/use-cases/list-projects.ts";
import { type ListUnits, makeListUnits } from "./application/use-cases/list-units.ts";
import {
  makeCreateProject,
  makeDeleteProject,
  makeGetProject,
  makeUpdateProject,
} from "./application/use-cases/project-use-cases.ts";
import {
  type LoadNode,
  makeLoadNode,
  makeResolveNodeRegionalSettings,
  type ResolveNodeRegionalSettings,
} from "./application/use-cases/resolve-regional-settings.ts";
import { makeDeleteUnit, makeGetUnit, makeListUnitTypes } from "./application/use-cases/unit-use-cases.ts";
import { makeUpdateOrganization, type UpdateOrganization } from "./application/use-cases/update-organization.ts";
import { makeUpdateUnit, type UpdateUnit } from "./application/use-cases/update-unit.ts";
import { CORE_UNIT_TYPES } from "./domain/core-unit-types.ts";
import { createUnitTypeRegistry, type UnitTypeRegistry } from "./domain/unit-type-registry.ts";

export type TenancyServices = {
  readonly unitTypes: UnitTypeRegistry;
  readonly createOrganization: CreateOrganization;
  /** Whether `createOrganization` would let the caller in (the `GET /v1/me` capability). */
  readonly mayCreateOrganization: MayCreateOrganization;
  readonly getOrganization: GetOrganization;
  readonly updateOrganization: UpdateOrganization;
  readonly deleteOrganization: DeleteOrganization;
  readonly listProjects: ListProjects;
  readonly createProject: ReturnType<typeof makeCreateProject>;
  readonly getProject: ReturnType<typeof makeGetProject>;
  readonly updateProject: ReturnType<typeof makeUpdateProject>;
  readonly deleteProject: ReturnType<typeof makeDeleteProject>;
  readonly listUnits: ListUnits;
  readonly createUnit: CreateUnit;
  readonly getUnit: ReturnType<typeof makeGetUnit>;
  readonly updateUnit: UpdateUnit;
  readonly deleteUnit: ReturnType<typeof makeDeleteUnit>;
  readonly listUnitTypes: ReturnType<typeof makeListUnitTypes>;
  readonly resolveRegionalSettings: ResolveNodeRegionalSettings;
  /** A node and its chain, unauthorized (the access context authorizes first, SP1 Task 12). */
  readonly loadNode: LoadNode;
};

/**
 * Binds the tenancy use cases (SP1 Task 10). SP2 passes the unit types of the installed
 * modules; the core adds its neutral `core.unit` (`CORE_UNIT_TYPES`, decision 0030 A6).
 * @throws {UnitTypeRegistryError} when the unit types conflict (startup bug).
 */
export const createTenancyServices = (
  args: { unitTypes: readonly UnitTypeDefinition[] } & Omit<TenancyDeps, "unitTypes">,
): TenancyServices => {
  const deps: TenancyDeps = { ...args, unitTypes: createUnitTypeRegistry([...CORE_UNIT_TYPES, ...args.unitTypes]) };
  return {
    unitTypes: deps.unitTypes,
    createOrganization: makeCreateOrganization(deps),
    mayCreateOrganization: makeMayCreateOrganization(deps),
    getOrganization: makeGetOrganization(deps),
    updateOrganization: makeUpdateOrganization(deps),
    deleteOrganization: makeDeleteOrganization(deps),
    listProjects: makeListProjects(deps),
    createProject: makeCreateProject(deps),
    getProject: makeGetProject(deps),
    updateProject: makeUpdateProject(deps),
    deleteProject: makeDeleteProject(deps),
    listUnits: makeListUnits(deps),
    createUnit: makeCreateUnit(deps),
    getUnit: makeGetUnit(deps),
    updateUnit: makeUpdateUnit(deps),
    deleteUnit: makeDeleteUnit(deps),
    listUnitTypes: makeListUnitTypes(deps),
    resolveRegionalSettings: makeResolveNodeRegionalSettings(deps),
    loadNode: makeLoadNode(deps),
  };
};
