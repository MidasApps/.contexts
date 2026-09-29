import { z } from "zod";

/** The local owner account (spec §1: `pnpm seed:local` creates the users). */
export const OWNER_EMAIL = "owner@demo.local";
/**
 * Local-only default. It can only ever reach the Auth Emulator of a `demo-*`
 * project (enforced below), so it guards nothing real; set SEED_OWNER_PASSWORD
 * in `.env.local` to use another one.
 */
export const DEFAULT_OWNER_PASSWORD = "demo-owner-password";
const OWNER_DISPLAY_NAME = "Demo Owner";
/** Firebase Auth rejects shorter passwords (WEAK_PASSWORD). */
const MIN_PASSWORD_LENGTH = 6;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const isLoopbackHostPort = (value: string): boolean => {
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(value);
  return match !== null && LOOPBACK_HOSTS.has(match[1] ?? "");
};

const SeedEnvSchema = z.object({
  APP_ENV: z.literal("local"),
  FIREBASE_PROJECT_ID: z.string().startsWith("demo-"),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().refine(isLoopbackHostPort),
  // Empty means unset: .env.example ships the key with no value.
  SEED_OWNER_PASSWORD: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(MIN_PASSWORD_LENGTH).default(DEFAULT_OWNER_PASSWORD)),
});

export type SeedOwner = { email: string; password: string; displayName: string };

export type SeedTarget = { projectId: string; authEmulatorOrigin: string; owner: SeedOwner };

/** Thrown when the environment could reach anything but the local emulators. */
export class UnsafeSeedTargetError extends Error {
  readonly code = "UNSAFE_SEED_TARGET";
  readonly variables: readonly string[];
  constructor(variables: readonly string[]) {
    super(
      `refusing to seed: ${variables.join(", ")} must target the local emulators ` +
        "(APP_ENV=local, a demo-* FIREBASE_PROJECT_ID, a loopback FIREBASE_AUTH_EMULATOR_HOST, SEED_OWNER_PASSWORD of 6+ chars)",
    );
    this.name = "UnsafeSeedTargetError";
    this.variables = variables;
  }
}

/**
 * Validates that seeding can only touch the Auth Emulator of a `demo-*` project
 * (processes/environments.md §9: local never points at a remote project).
 *
 * @throws {UnsafeSeedTargetError} naming the offending variables, never their values.
 */
export const resolveSeedTarget = (env: Readonly<Record<string, string | undefined>>): SeedTarget => {
  const parsed = SeedEnvSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new UnsafeSeedTargetError(variables);
  }
  return {
    projectId: parsed.data.FIREBASE_PROJECT_ID,
    authEmulatorOrigin: `http://${parsed.data.FIREBASE_AUTH_EMULATOR_HOST}`,
    owner: { email: OWNER_EMAIL, password: parsed.data.SEED_OWNER_PASSWORD, displayName: OWNER_DISPLAY_NAME },
  };
};
