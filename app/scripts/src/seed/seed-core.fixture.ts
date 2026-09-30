// In-memory fakes of the seed ports: a `SeedCore` that behaves like the services use cases
// the adapter calls (ids from a counter, `MEMBERSHIP_EXISTS` on a second grant on a node),
// and an `AuthAdmin` keyed by email.
import type { AuthAdmin, AuthUser } from "./auth-admin.ts";
import type { Named, SeedCore, SeedGrantNode } from "./seed-core-port.ts";
import { resolveSeedTarget, type SeedTarget } from "./seed-target.ts";

type Unit = Named & { projectId: string; parentUnitId: string | null };

export const makeFakeSeedCore = () => {
  let next = 0;
  const id = (prefix: string) => `${prefix}-${String(++next)}`;
  const organizations: (Named & { ownerUid: string })[] = [];
  const projects: (Named & { organizationId: string })[] = [];
  const units: Unit[] = [];
  const grants = new Map<string, string>();
  const profiles = new Set<string>();
  const active = new Map<string, string>();
  const staff = new Map<string, string>();
  const phones = new Map<string, string>();
  const nodeKey = (principalUid: string, node: SeedGrantNode) => `${principalUid}@${node.level === "organization" ? node.organizationId : node.projectId}`;
  const core: SeedCore = {
    ensureProfile: (uid) => Promise.resolve(void profiles.add(uid)),
    listOrganizations: (uid) => Promise.resolve(organizations.filter((organization) => organization.ownerUid === uid)),
    createOrganization: ({ uid, name }) => {
      const organization = { id: id("org"), name, ownerUid: uid };
      organizations.push(organization);
      return Promise.resolve(organization);
    },
    listProjects: ({ organizationId }) => Promise.resolve(projects.filter((project) => project.organizationId === organizationId)),
    createProject: ({ organizationId, name }) => {
      const project = { id: id("project"), name, organizationId };
      projects.push(project);
      return Promise.resolve(project);
    },
    listUnits: ({ projectId, parentUnitId }) => Promise.resolve(units.filter((unit) => unit.projectId === projectId && unit.parentUnitId === parentUnitId)),
    createUnit: ({ projectId, parentUnitId, name }) => {
      const unit = { id: id("unit"), name, projectId, parentUnitId };
      units.push(unit);
      return Promise.resolve(unit);
    },
    grantRole: ({ principalUid, node, role }) => {
      const key = nodeKey(principalUid, node);
      if (grants.has(key)) return Promise.resolve("unchanged");
      grants.set(key, role);
      return Promise.resolve("granted");
    },
    ensureActiveOrganization: ({ uid, organizationId }) => {
      if (active.get(uid) === organizationId) return Promise.resolve("unchanged");
      active.set(uid, organizationId);
      return Promise.resolve("set");
    },
    staffRoleOf: (uid) => Promise.resolve(staff.get(uid) ?? null),
    grantStaff: ({ uid, role }) => Promise.resolve(void staff.set(uid, role)),
    ensurePhoneFactor: ({ uid, phoneNumber }) => {
      if (phones.get(uid) === phoneNumber) return Promise.resolve("unchanged");
      phones.set(uid, phoneNumber);
      return Promise.resolve("enrolled");
    },
  };
  return { core, organizations, projects, units, grants, profiles, active, staff, phones };
};

export const makeFakeAuthAdmin = (): AuthAdmin & { users: Map<string, AuthUser> } => {
  const users = new Map<string, AuthUser>();
  let next = 0;
  const save = (localId: string, input: { email: string; displayName: string; emailVerified: boolean }) => {
    const user = { localId, email: input.email, displayName: input.displayName, emailVerified: input.emailVerified };
    users.set(input.email, user);
    return Promise.resolve(user);
  };
  return {
    users,
    findUserByEmail: (email) => Promise.resolve(users.get(email)),
    createUser: (input) => save(`uid-${String(++next)}`, input),
    updateUser: (localId, input) => save(localId, input),
  };
};

export const localSeedTarget = (): SeedTarget =>
  resolveSeedTarget({ APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" });
