import { findOrCreate, type Named, requireUid, type SeedCore, type SeedState } from "./seed-core-port.ts";

/** Generic tenancy of the local seed (SP1 Task 20); names are the idempotency keys. */
export const SEED_TENANCY = {
  demo: { name: "Demo Organization", projects: ["Project 1", "Project 2"] },
  second: { name: "Second Organization", projects: ["Project 1"] },
  units: { root: "Unit A", child: "Unit A.1" },
} as const;

type Counter = { created: number; total: number };
type Counters = Record<"organizations" | "projects" | "units", Counter>;

const count = (counter: Counter, created: boolean): void => {
  counter.total += 1;
  if (created) counter.created += 1;
};

const seedOrganization = async (
  core: SeedCore,
  args: { uid: string; name: string; projects: readonly string[]; counters: Counters },
) => {
  const organization = await findOrCreate({
    existing: await core.listOrganizations(args.uid),
    name: args.name,
    create: () => core.createOrganization({ uid: args.uid, name: args.name }),
  });
  count(args.counters.organizations, organization.created);
  const projects: Named[] = [];
  for (const name of args.projects) {
    const project = await findOrCreate({
      existing: await core.listProjects({ uid: args.uid, organizationId: organization.node.id }),
      name,
      create: () => core.createProject({ uid: args.uid, organizationId: organization.node.id, name }),
    });
    count(args.counters.projects, project.created);
    projects.push(project.node);
  }
  return { organization: organization.node, projects };
};

// "Unit A" directly under the project, "Unit A.1" under it (two levels).
const seedUnitTree = async (
  core: SeedCore,
  args: { uid: string; projectId: string; counter: Counter },
): Promise<void> => {
  let parentUnitId: string | null = null;
  for (const name of [SEED_TENANCY.units.root, SEED_TENANCY.units.child]) {
    const scope = { uid: args.uid, projectId: args.projectId, parentUnitId };
    const unit = await findOrCreate({
      existing: await core.listUnits(scope),
      name,
      create: () => core.createUnit({ ...scope, name }),
    });
    count(args.counter, unit.created);
    parentUnitId = unit.node.id;
  }
};

const summaryOf = (args: { counters: Counters; activeChanged: boolean; demoOrganizationId: string }): string => {
  const { organizations, projects, units } = args.counters;
  const totals = `${organizations.total} organizations, ${projects.total} projects, ${units.total} units`;
  const demo = `${SEED_TENANCY.demo.name} ${args.demoOrganizationId}`;
  const created = organizations.created + projects.created + units.created;
  if (created === 0 && !args.activeChanged) return `unchanged (${totals}; ${demo})`;
  return `created ${organizations.created} organizations, ${projects.created} projects, ${units.created} units (of ${totals}); ${demo}`;
};

/**
 * The owner's two organizations, two projects in the first and one in the second, and a
 * two-level unit tree in the first project. The owner's active organization is the first.
 * Idempotent: every node is looked up by name before it is created.
 * @returns a one-line summary (`unchanged` when nothing was created).
 */
export const seedTenancy = async (core: SeedCore, state: SeedState): Promise<string> => {
  const uid = requireUid(state, "owner");
  const counters: Counters = {
    organizations: { created: 0, total: 0 },
    projects: { created: 0, total: 0 },
    units: { created: 0, total: 0 },
  };
  const demo = await seedOrganization(core, { uid, ...SEED_TENANCY.demo, counters });
  await seedOrganization(core, { uid, ...SEED_TENANCY.second, counters });
  const firstProject = demo.projects[0];
  if (firstProject === undefined) throw new Error("seed tenancy: the demo organization has no project");
  await seedUnitTree(core, { uid, projectId: firstProject.id, counter: counters.units });
  const active = await core.ensureActiveOrganization({ uid, organizationId: demo.organization.id });
  state.demoOrganizationId = demo.organization.id;
  state.firstProjectId = firstProject.id;
  return summaryOf({ counters, activeChanged: active === "set", demoOrganizationId: demo.organization.id });
};
