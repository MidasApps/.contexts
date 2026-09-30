import { describe, expect, it } from "vitest";
import { makeFakeAuthAdmin, makeFakeSeedCore, localSeedTarget } from "./seed-core.fixture.ts";
import type { SeedState } from "./seed-core-port.ts";
import { seedMembers } from "./seed-members.ts";
import { SEED_STAFF_PHONE, seedStaff } from "./seed-staff.ts";
import { seedTenancy } from "./seed-tenancy.ts";

const OWNER_UID = "uid-owner";

const runAll = async (world: { core: ReturnType<typeof makeFakeSeedCore>["core"]; auth: ReturnType<typeof makeFakeAuthAdmin> }) => {
  const state: SeedState = { uids: { owner: OWNER_UID } };
  const target = localSeedTarget();
  const tenancy = await seedTenancy(world.core, state);
  const members = await seedMembers({ ...world, target, state });
  const staff = await seedStaff({ ...world, target, state });
  return { state, summaries: { tenancy, members, staff } };
};

describe("SP1 seed steps", () => {
  it("seeds two organizations, three projects and a two-level unit tree for the owner", async () => {
    const fake = makeFakeSeedCore();
    const state: SeedState = { uids: { owner: OWNER_UID } };
    expect(await seedTenancy(fake.core, state)).toMatch(/^created 2 organizations, 3 projects, 2 units/);
    expect(fake.organizations.map((organization) => organization.name)).toEqual(["Demo Organization", "Second Organization"]);
    const [demo, second] = fake.organizations;
    expect(fake.projects.map((project) => `${project.organizationId}/${project.name}`)).toEqual([`${demo?.id}/Project 1`, `${demo?.id}/Project 2`, `${second?.id}/Project 1`]);
    const [root, child] = fake.units;
    expect(root).toMatchObject({ name: "Unit A", projectId: fake.projects[0]?.id, parentUnitId: null });
    expect(child).toMatchObject({ name: "Unit A.1", projectId: fake.projects[0]?.id, parentUnitId: root?.id });
    expect(fake.active.get(OWNER_UID)).toBe(demo?.id);
    expect(state).toMatchObject({ demoOrganizationId: demo?.id, firstProjectId: fake.projects[0]?.id });
  });

  it("creates the member, viewer, invitee and staff accounts with their grants", async () => {
    const fake = makeFakeSeedCore();
    const auth = makeFakeAuthAdmin();
    const { state } = await runAll({ core: fake.core, auth });
    expect([...auth.users.keys()].sort()).toEqual(["invitee@demo.local", "member@demo.local", "staff@demo.local", "viewer@demo.local"]);
    expect([...auth.users.values()].every((user) => user.emailVerified)).toBe(true);
    const { member, viewer, invitee, staff } = state.uids;
    expect(Object.fromEntries(fake.grants)).toEqual({ [`${member}@${state.firstProjectId}`]: "member", [`${viewer}@${state.demoOrganizationId}`]: "viewer" });
    expect([...fake.grants.keys()].some((key) => key.startsWith(`${invitee}@`))).toBe(false);
    expect(fake.staff.get(staff ?? "")).toBe("platform-admin");
    expect(fake.phones.get(staff ?? "")).toBe(SEED_STAFF_PHONE);
    expect([member, viewer, invitee, staff].every((uid) => fake.profiles.has(uid ?? ""))).toBe(true);
    expect(fake.active.get(viewer ?? "")).toBe(state.demoOrganizationId);
    expect(fake.active.has(member ?? "")).toBe(false);
  });

  it("reports unchanged for every step on the second run and creates no second copy", async () => {
    const fake = makeFakeSeedCore();
    const auth = makeFakeAuthAdmin();
    await runAll({ core: fake.core, auth });
    const sizes = () => [fake.organizations.length, fake.projects.length, fake.units.length, fake.grants.size, auth.users.size, fake.staff.size];
    const before = sizes();
    const { summaries } = await runAll({ core: fake.core, auth });
    expect(summaries.tenancy).toMatch(/^unchanged \(2 organizations, 3 projects, 2 units;/);
    expect(summaries.members).toMatch(/^unchanged grants;/);
    expect(summaries.staff).toMatch(/^unchanged \(uid /);
    expect(sizes()).toEqual(before);
  });

  it("refuses to run a step before the step it depends on", async () => {
    const fake = makeFakeSeedCore();
    await expect(seedTenancy(fake.core, { uids: {} })).rejects.toThrow(/owner user must be seeded first/);
    const members = seedMembers({ core: fake.core, auth: makeFakeAuthAdmin(), target: localSeedTarget(), state: { uids: { owner: OWNER_UID } } });
    await expect(members).rejects.toThrow(/tenancy must be seeded first/);
  });
});
