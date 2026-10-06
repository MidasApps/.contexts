import { z } from "zod";

/** The local owner account (spec §1: `pnpm seed:local` creates the users). */
export const OWNER_EMAIL = "owner@demo.local";
/**
 * Local-only defaults. They can only ever reach the emulators of a `demo-*` project
 * (enforced below), so they guard nothing real; set `SEED_<USER>_PASSWORD` in
 * `.env.local` to use others.
 */
export const DEFAULT_OWNER_PASSWORD = "demo-owner-password";
const OWNER_DISPLAY_NAME = "Demo Owner";
/** Firebase Auth rejects shorter passwords (WEAK_PASSWORD). */
const MIN_PASSWORD_LENGTH = 6;

/** The other seeded accounts (SP1 Task 20): email, display name and password variable. */
export const SEED_USERS = {
  member: { email: "member@demo.local", displayName: "Demo Member", passwordVariable: "SEED_MEMBER_PASSWORD" },
  viewer: { email: "viewer@demo.local", displayName: "Demo Viewer", passwordVariable: "SEED_VIEWER_PASSWORD" },
  invitee: { email: "invitee@demo.local", displayName: "Demo Invitee", passwordVariable: "SEED_INVITEE_PASSWORD" },
  staff: { email: "staff@demo.local", displayName: "Demo Staff", passwordVariable: "SEED_STAFF_PASSWORD" },
} as const;

export type SeedUserKey = keyof typeof SEED_USERS;

/** `demo-<key>-password`, e.g. `demo-member-password`. */
export const defaultPasswordOf = (key: SeedUserKey | "owner"): string => `demo-${key}-password`;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const isLoopbackHostPort = (value: string): boolean => {
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(value);
  return match !== null && LOOPBACK_HOSTS.has(match[1] ?? "");
};

// Empty means unset: .env.example ships the keys with no value.
const passwordOf = (fallback: string) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().min(MIN_PASSWORD_LENGTH).default(fallback));

const SeedEnvSchema = z.object({
  APP_ENV: z.literal("local"),
  FIREBASE_PROJECT_ID: z.string().startsWith("demo-"),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().refine(isLoopbackHostPort),
  // The SP1 steps write Firestore through the services (processes/environments.md §9).
  FIRESTORE_EMULATOR_HOST: z.string().refine(isLoopbackHostPort),
  SEED_OWNER_PASSWORD: passwordOf(DEFAULT_OWNER_PASSWORD),
  SEED_MEMBER_PASSWORD: passwordOf(defaultPasswordOf("member")),
  SEED_VIEWER_PASSWORD: passwordOf(defaultPasswordOf("viewer")),
  SEED_INVITEE_PASSWORD: passwordOf(defaultPasswordOf("invitee")),
  SEED_STAFF_PASSWORD: passwordOf(defaultPasswordOf("staff")),
});

export type SeedUser = { email: string; password: string; displayName: string };
/** Kept for the owner step and its tests. */
export type SeedOwner = SeedUser;

export type SeedTarget = {
  projectId: string;
  authEmulatorOrigin: string;
  owner: SeedUser;
  users: Record<SeedUserKey, SeedUser>;
};

/** Thrown when the environment could reach anything but the local emulators. */
export class UnsafeSeedTargetError extends Error {
  readonly code = "UNSAFE_SEED_TARGET";
  readonly variables: readonly string[];
  constructor(variables: readonly string[]) {
    super(
      `refusing to seed: ${variables.join(", ")} must target the local emulators ` +
        "(APP_ENV=local, a demo-* FIREBASE_PROJECT_ID, loopback FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST, SEED_*_PASSWORD of 6+ chars)",
    );
    this.name = "UnsafeSeedTargetError";
    this.variables = variables;
  }
}

/**
 * Validates that seeding can only touch the Auth and Firestore emulators of a `demo-*`
 * project (processes/environments.md §9: local never points at a remote project).
 *
 * @throws {UnsafeSeedTargetError} naming the offending variables, never their values.
 */
export const resolveSeedTarget = (env: Readonly<Record<string, string | undefined>>): SeedTarget => {
  const parsed = SeedEnvSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new UnsafeSeedTargetError(variables);
  }
  const data = parsed.data;
  const user = (key: SeedUserKey): SeedUser => ({
    email: SEED_USERS[key].email,
    displayName: SEED_USERS[key].displayName,
    password: data[SEED_USERS[key].passwordVariable],
  });
  return {
    projectId: data.FIREBASE_PROJECT_ID,
    authEmulatorOrigin: `http://${data.FIREBASE_AUTH_EMULATOR_HOST}`,
    owner: { email: OWNER_EMAIL, password: data.SEED_OWNER_PASSWORD, displayName: OWNER_DISPLAY_NAME },
    users: { member: user("member"), viewer: user("viewer"), invitee: user("invitee"), staff: user("staff") },
  };
};
