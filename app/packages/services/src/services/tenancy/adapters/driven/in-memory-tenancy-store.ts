import {
  type Organization,
  OrganizationIdSchema,
  type Project,
  ProjectIdSchema,
  type Unit,
  UnitIdSchema,
} from "@core/contracts";
import type { InMemoryAccessStore } from "#/services/access/adapters/driven/in-memory-access-store.ts";
import { paginateInMemory } from "#/services/shared/pagination/page.ts";
import type { OrganizationRepository } from "../../application/ports/driven/organization-repository.ts";
import type { ProjectRepository } from "../../application/ports/driven/project-repository.ts";
import type { UnitRepository } from "../../application/ports/driven/unit-repository.ts";
import type { TreeLock, UnitTreeLockStore } from "../../application/ports/driven/unit-tree-lock-store.ts";

type Row<T> = { value: T; deletedAt: string | null };

/**
 * In-memory tenancy repositories for unit tests. Every write is mirrored into the Task 6
 * access store, so `authorize()` loads the same node chains the use cases wrote.
 */
export type InMemoryTenancyStore = {
  readonly organizations: OrganizationRepository;
  readonly projects: ProjectRepository;
  readonly units: UnitRepository;
  readonly treeLocks: UnitTreeLockStore & { readonly lockOf: (projectId: string) => TreeLock | undefined };
  readonly unitRow: (id: string) => (Unit & { deletedAt: string | null }) | undefined;
};

const live = <T>(row: Row<T> | undefined): T | null => (row === undefined || row.deletedAt !== null ? null : row.value);

const liveValues = <T>(table: Map<string, Row<T>>): T[] =>
  [...table.values()].filter((row) => row.deletedAt === null).map((row) => row.value);

type Tables = {
  organizations: Map<string, Row<Organization>>;
  projects: Map<string, Row<Project>>;
  units: Map<string, Row<Unit>>;
  next: { value: number };
};

const nextId = (tables: Tables, prefix: string): string => {
  tables.next.value += 1;
  return `${prefix}-${tables.next.value}`;
};

const makeOrganizations = (tables: Tables, mirror: InMemoryAccessStore): OrganizationRepository => {
  const put = (organization: Organization, deletedAt: string | null) => {
    tables.organizations.set(organization.id, { value: organization, deletedAt });
    mirror.putOrganization({ id: organization.id, status: organization.status, isDeleted: deletedAt !== null });
  };
  return {
    newId: () => OrganizationIdSchema.parse(nextId(tables, "org")),
    get: (_tx, id) => Promise.resolve(live(tables.organizations.get(id))),
    create: (_tx, { organization }) => put(organization, null),
    update: (_tx, { organization }) => put(organization, null),
    softDelete: (_tx, { id, deletedAt }) => {
      const row = tables.organizations.get(id);
      if (row !== undefined) put(row.value, deletedAt);
    },
  };
};

const makeProjects = (tables: Tables, mirror: InMemoryAccessStore): ProjectRepository => {
  const put = (project: Project, deletedAt: string | null) => {
    tables.projects.set(project.id, { value: project, deletedAt });
    mirror.putProject({ id: project.id, tenantId: project.tenantId, isDeleted: deletedAt !== null });
  };
  return {
    newId: () => ProjectIdSchema.parse(nextId(tables, "project")),
    get: (_tx, id) => Promise.resolve(live(tables.projects.get(id))),
    getMany: ({ tenantId, ids }) =>
      Promise.resolve(ids.flatMap((id) => live(tables.projects.get(id)) ?? []).filter((p) => p.tenantId === tenantId)),
    list: ({ tenantId, page }) =>
      Promise.resolve(
        paginateInMemory({
          items: liveValues(tables.projects).filter((p) => p.tenantId === tenantId),
          page,
          positionOf: (p) => [p.name, p.id],
        }),
      ),
    create: (_tx, { project }) => put(project, null),
    update: (_tx, { project }) => put(project, null),
    softDelete: (_tx, { id, deletedAt }) => {
      const row = tables.projects.get(id);
      if (row !== undefined) put(row.value, deletedAt);
    },
  };
};

const makeUnits = (tables: Tables, mirror: InMemoryAccessStore): UnitRepository => {
  const put = (unit: Unit, deletedAt: string | null) => {
    tables.units.set(unit.id, { value: unit, deletedAt });
    mirror.putUnit({
      id: unit.id,
      tenantId: unit.tenantId,
      projectId: unit.projectId,
      ancestorIds: unit.ancestorIds,
      isDeleted: deletedAt !== null,
    });
  };
  const softDelete = (id: string, deletedAt: string) => {
    const row = tables.units.get(id);
    if (row !== undefined) put(row.value, deletedAt);
  };
  return {
    newId: () => UnitIdSchema.parse(nextId(tables, "unit")),
    get: (_tx, id) => Promise.resolve(live(tables.units.get(id))),
    getMany: (ids) => Promise.resolve(ids.flatMap((id) => live(tables.units.get(id)) ?? [])),
    listChildren: ({ projectId, parentUnitId, page }) =>
      Promise.resolve(
        paginateInMemory({
          items: liveValues(tables.units).filter((u) => u.projectId === projectId && u.parentUnitId === parentUnitId),
          page,
          positionOf: (u) => [u.name, u.id],
        }),
      ),
    listOfProject: ({ projectId, limit }) =>
      Promise.resolve(
        liveValues(tables.units)
          .filter((u) => u.projectId === projectId)
          .slice(0, limit),
      ),
    listDescendants: ({ tenantId, unitId, limit }) =>
      Promise.resolve(
        liveValues(tables.units)
          .filter((u) => u.tenantId === tenantId && u.ancestorIds.includes(unitId))
          .slice(0, limit),
      ),
    create: (_tx, { unit }) => put(unit, null),
    update: (_tx, { unit }) => put(unit, null),
    softDelete: (_tx, { id, deletedAt }) => softDelete(id, deletedAt),
    rewriteTree: ({ rewrites, updatedAt }) => {
      for (const rewrite of rewrites) {
        const row = tables.units.get(rewrite.id);
        if (row !== undefined)
          put(
            {
              ...row.value,
              parentUnitId: rewrite.parentUnitId,
              ancestorIds: [...rewrite.ancestorIds],
              depth: rewrite.depth,
              updatedAt,
            },
            row.deletedAt,
          );
      }
      return Promise.resolve();
    },
    softDeleteMany: ({ ids, deletedAt }) => {
      for (const id of ids) softDelete(id, deletedAt);
      return Promise.resolve();
    },
  };
};

const makeTreeLocks = (tables: Tables): InMemoryTenancyStore["treeLocks"] => {
  const locks = new Map<string, TreeLock>();
  return {
    newLockId: () => nextId(tables, "lock"),
    get: (_tx, projectId) => Promise.resolve(locks.get(projectId) ?? null),
    put: (_tx, lock) => void locks.set(lock.projectId, lock),
    remove: (_tx, projectId) => void locks.delete(projectId),
    lockOf: (projectId) => locks.get(projectId),
  };
};

/** Creates empty in-memory tenancy repositories mirrored into `mirror`. */
export const createInMemoryTenancyStore = (mirror: InMemoryAccessStore): InMemoryTenancyStore => {
  const tables: Tables = { organizations: new Map(), projects: new Map(), units: new Map(), next: { value: 0 } };
  return {
    organizations: makeOrganizations(tables, mirror),
    projects: makeProjects(tables, mirror),
    units: makeUnits(tables, mirror),
    treeLocks: makeTreeLocks(tables),
    unitRow: (id) => {
      const row = tables.units.get(id);
      return row === undefined ? undefined : { ...row.value, deletedAt: row.deletedAt };
    },
  };
};
