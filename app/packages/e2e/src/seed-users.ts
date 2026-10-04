import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createV1Client, type V1Client, V1RequestError } from "./api.ts";
import type { E2eEnv } from "./e2e-env.ts";
import { type AuthUserInput, createEmulatorAuth, type EmulatorAuth } from "./emulator.ts";

/** Seeded accounts (Auth Emulator of the e2e project only; `readE2eEnv` refuses anything else). */
export const SEED_USERS = {
  // Same account and default password as `pnpm seed:local` (scripts/src/seed/seed-target.ts).
  owner: { email: "owner@demo.local", password: "demo-owner-password", displayName: "Demo Owner" },
  // Same account as `pnpm seed:local`; its only grant is `member` on a project (decision 0030 A5).
  member: { email: "member@demo.local", password: "demo-member-password", displayName: "Demo Member" },
  viewer: { email: "viewer@e2e.local", password: "e2e-viewer-password", displayName: "Vera Viewer" },
  restricted: { email: "restricted@e2e.local", password: "e2e-restricted-password", displayName: "Rui Restricted" },
  staff: { email: "staff@e2e.local", password: "e2e-staff-password", displayName: "Sara Staff", phone: "+15555550100" },
} as const satisfies Record<string, AuthUserInput & { phone?: string }>;

export type SeedUserKey = keyof typeof SEED_USERS;

type Named = { id: string; name: string };
export type World = {
  alpha: Named & { projects: { launch: Named; growth: Named }; units: { north: Named }; coreOnlyRoleId: string };
  beta: Named & { projects: { pilot: Named } };
};

type Page<T> = T[];
const ORG_DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } as const;
/** Custom role without any module permission: the example module's nav item is hidden for it. */
const CORE_ONLY_ROLE = {
  name: "Core only",
  description: "Organization and projects, no modules.",
  permissions: ["core.organization.read", "core.project.read"],
};
/** Workspace root (`app/`), for the `pnpm platform:grant-staff` script. */
const APP_ROOT = path.resolve(import.meta.dirname, "../../..");
const run = promisify(execFile);

const pick = (value: Named): Named => ({ id: value.id, name: value.name });

const ensureOrganization = async (api: V1Client, name: string): Promise<Named> => {
  const existing = (await api.get<Page<Named>>("/v1/me/organizations?limit=100")).find((org) => org.name === name);
  return pick(existing ?? (await api.post<Named>("/v1/organizations", { name, defaults: ORG_DEFAULTS })));
};

const ensureProject = async (api: V1Client, organizationId: string, name: string): Promise<Named> => {
  const existing = (await api.get<Page<Named>>(`/v1/organizations/${organizationId}/projects?limit=100`)).find(
    (project) => project.name === name,
  );
  return pick(existing ?? (await api.post<Named>(`/v1/organizations/${organizationId}/projects`, { name })));
};

const ensureUnit = async (api: V1Client, projectId: string, name: string): Promise<Named> => {
  const existing = (await api.get<Page<Named>>(`/v1/projects/${projectId}/units?limit=100`)).find(
    (unit) => unit.name === name,
  );
  return pick(
    existing ??
      (await api.post<Named>(`/v1/projects/${projectId}/units`, { name, type: "example.area", parentUnitId: null })),
  );
};

/**
 * Enables an installed module for the organization (decision 0064): its id in
 * `agent-settings.enabledAgents`. Reads first and writes only when it is missing.
 */
const ensureModuleEnabled = async (api: V1Client, organizationId: string, moduleId: string): Promise<void> => {
  const settingsPath = `/v1/agent-settings?organizationId=${organizationId}`;
  const { enabledAgents } = await api.get<{ enabledAgents: string[] }>(settingsPath);
  if (enabledAgents.includes(moduleId)) return;
  await api.patch(settingsPath, { enabledAgents: [...enabledAgents, moduleId] });
};

const ensureCoreOnlyRole = async (api: V1Client, organizationId: string): Promise<string> => {
  const existing = (await api.get<Page<Named>>(`/v1/organizations/${organizationId}/roles?limit=100`)).find(
    (role) => role.name === CORE_ONLY_ROLE.name,
  );
  return (existing ?? (await api.post<Named>(`/v1/organizations/${organizationId}/roles`, CORE_ONLY_ROLE))).id;
};

export type RoleRef =
  | { kind: "system"; key: "owner" | "admin" | "member" | "viewer" }
  | { kind: "custom"; roleId: string };

/**
 * Makes `member` join the organization (or one of its projects) with `roles` the way people do: an
 * invitation from the owner, accepted by the invitee. A member already there is left as is.
 */
export const joinOrganization = async (args: {
  owner: V1Client;
  member: V1Client;
  email: string;
  organizationId: string;
  roles: RoleRef[];
  /** Grant on this project instead of the organization. */
  projectId?: string;
}): Promise<void> => {
  const node =
    args.projectId === undefined
      ? { level: "organization", tenantId: args.organizationId }
      : { level: "project", tenantId: args.organizationId, projectId: args.projectId };
  try {
    const { acceptUrl } = await args.owner.post<{ acceptUrl: string }>(
      `/v1/organizations/${args.organizationId}/invitations`,
      {
        email: args.email,
        node,
        roles: args.roles,
      },
    );
    const token = new URLSearchParams(new URL(acceptUrl).hash.slice(1)).get("token");
    await args.member.post("/v1/invitations/accept", { token });
  } catch (error: unknown) {
    if (error instanceof V1RequestError && error.code === "MEMBERSHIP_EXISTS") return;
    throw error;
  }
};

/** Signs the user in over REST and returns a `/v1` client with their ID token. */
export const apiFor = async (
  env: E2eEnv,
  auth: EmulatorAuth,
  user: { email: string; password: string },
): Promise<V1Client> =>
  createV1Client({ origin: env.E2E_WEB_ORIGIN, idToken: await auth.signIn(user.email, user.password) });

const grantStaff = async (env: E2eEnv, email: string): Promise<void> => {
  const script = path.join(APP_ROOT, "scripts", "grant-platform-staff.ts");
  const project = env.E2E_PROJECT_ID;
  await run(
    process.execPath,
    [script, "--project", project, "--email", email, "--role", "platform-admin", "--confirm", project],
    {
      cwd: APP_ROOT,
      env: { ...process.env, APP_ENV: "local" },
    },
  );
};

const seedStructure = async (owner: V1Client) => {
  const beta = await ensureOrganization(owner, "Beta Org");
  const pilot = await ensureProject(owner, beta.id, "Beta Pilot");
  const alpha = await ensureOrganization(owner, "Alpha Org");
  const launch = await ensureProject(owner, alpha.id, "Alpha Launch");
  const growth = await ensureProject(owner, alpha.id, "Alpha Growth");
  const north = await ensureUnit(owner, launch.id, "North Area");
  const coreOnlyRoleId = await ensureCoreOnlyRole(owner, alpha.id);
  // Alpha's journeys use the example module (its page, its settings, the note form in the chat).
  await ensureModuleEnabled(owner, alpha.id, "example");
  return {
    alpha: { ...alpha, projects: { launch, growth }, units: { north }, coreOnlyRoleId },
    beta: { ...beta, projects: { pilot } },
  } satisfies World;
};

/**
 * Idempotent e2e world: the five accounts, "Alpha Org" (two projects, a unit, a core-only role,
 * the example module enabled,
 * the viewer, the restricted member and the project-only member on "Alpha Growth") and a pristine "Beta Org" (empty-state lists). The owner's
 * last context is Alpha. Staff gets `platform-admin` and an SMS second factor.
 */
export const seedWorld = async (env: E2eEnv): Promise<World> => {
  const auth = createEmulatorAuth(env);
  const users = await Promise.all(Object.values(SEED_USERS).map((user) => auth.upsertUser(user)));
  const owner = await apiFor(env, auth, SEED_USERS.owner);
  await owner.get("/v1/me");
  const world = await seedStructure(owner);
  const alphaId = world.alpha.id;
  const viewer = await apiFor(env, auth, SEED_USERS.viewer);
  const restricted = await apiFor(env, auth, SEED_USERS.restricted);
  await joinOrganization({
    owner,
    member: viewer,
    email: SEED_USERS.viewer.email,
    organizationId: alphaId,
    roles: [{ kind: "system", key: "viewer" }],
  });
  await joinOrganization({
    owner,
    member: restricted,
    email: SEED_USERS.restricted.email,
    organizationId: alphaId,
    roles: [{ kind: "custom", roleId: world.alpha.coreOnlyRoleId }],
  });
  const member = await apiFor(env, auth, SEED_USERS.member);
  const growthId = world.alpha.projects.growth.id;
  await joinOrganization({
    owner,
    member,
    email: SEED_USERS.member.email,
    organizationId: alphaId,
    projectId: growthId,
    roles: [{ kind: "system", key: "member" }],
  });
  // Any live grant in the organization's tree lets its holder switch to it (decision 0030 A5).
  for (const client of [owner, viewer, restricted, member])
    await client.put("/v1/me/active-organization", { organizationId: alphaId });
  await grantStaff(env, SEED_USERS.staff.email);
  const staffUid = users[Object.keys(SEED_USERS).indexOf("staff")]?.uid;
  if (staffUid !== undefined) await auth.enrollPhone(staffUid, SEED_USERS.staff.phone);
  return world;
};

/** Path of a storage state (or the world file) under an app's gitignored `e2e/.auth/`. */
export const authFile = (name: string, authDir: string): string => path.join(authDir, `${name}.json`);

export const writeWorld = (world: World, authDir: string): void => {
  mkdirSync(authDir, { recursive: true });
  writeFileSync(authFile("world", authDir), JSON.stringify(world, null, 2));
};

/** The world the app's setup project wrote; specs read it for ids and names. */
export const readWorld = (authDir: string): World =>
  JSON.parse(readFileSync(authFile("world", authDir), "utf8")) as World;
