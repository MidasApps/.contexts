import { PLATFORM_ROLES, type PlatformRole } from "@core/services";
import { z } from "zod";

/** What `pnpm platform:grant-staff` writes, and where (SP1 spec §3.4). */
export type GrantStaffArgs = {
  readonly projectId: string;
  readonly email: string;
  readonly role: PlatformRole;
  readonly appEnv: "local" | "dev" | "staging" | "prod";
};

/** Thrown for missing, unknown or unconfirmed flags; names flags and variables, never values. */
export class GrantStaffArgsError extends Error {
  readonly code = "INVALID_GRANT_STAFF_ARGS";

  constructor(reason: string) {
    super(`refusing to grant platform staff: ${reason}`);
    this.name = "GrantStaffArgsError";
  }
}

const FLAGS = ["--project", "--email", "--role", "--confirm"] as const;
type Flag = (typeof FLAGS)[number];

// Firebase project ids: 6-30 chars, lower-case letters, digits and hyphens.
const ProjectIdSchema = z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
const EmulatorProjectSchema = z.string().startsWith("demo-");
const AppEnvSchema = z.enum(["local", "dev", "staging", "prod"]);

const readFlags = (argv: readonly string[]): Record<Flag, string> => {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? "";
    const value = argv[index + 1];
    if (!(FLAGS as readonly string[]).includes(flag)) throw new GrantStaffArgsError(`unknown argument ${flag.startsWith("--") ? flag : "(value)"}`);
    if (values.has(flag)) throw new GrantStaffArgsError(`${flag} given twice`);
    if (value === undefined || value.startsWith("--")) throw new GrantStaffArgsError(`${flag} needs a value`);
    values.set(flag, value);
  }
  const missing = FLAGS.filter((flag) => !values.has(flag));
  if (missing.length > 0) throw new GrantStaffArgsError(`missing ${missing.join(", ")}`);
  return Object.fromEntries(values) as Record<Flag, string>;
};

// Local runs only reach an emulator project; remote runs never target one (processes/environments.md).
const checkEnvironment = (appEnv: GrantStaffArgs["appEnv"], projectId: string): void => {
  const emulator = EmulatorProjectSchema.safeParse(projectId).success;
  if (appEnv === "local" && !emulator) throw new GrantStaffArgsError("APP_ENV=local only targets a demo-* emulator project");
  if (appEnv !== "local" && emulator) throw new GrantStaffArgsError(`APP_ENV=${appEnv} cannot target a demo-* emulator project`);
};

/**
 * Parses `--project <id> --email <email> --role <platform-admin|platform-support>
 * --confirm <id>`; `--confirm` must repeat `--project` (no silent cross-project writes).
 * @throws {GrantStaffArgsError} naming the offending flag or variable.
 */
export const parseGrantStaffArgs = (argv: readonly string[], env: Readonly<Record<string, string | undefined>>): GrantStaffArgs => {
  const flags = readFlags(argv);
  if (!ProjectIdSchema.safeParse(flags["--project"]).success) throw new GrantStaffArgsError("--project is not a Firebase project id");
  if (flags["--confirm"] !== flags["--project"]) throw new GrantStaffArgsError("--confirm must equal --project");
  if (!z.email().safeParse(flags["--email"]).success) throw new GrantStaffArgsError("--email is not an email address");
  const role = z.enum(PLATFORM_ROLES).safeParse(flags["--role"]);
  if (!role.success) throw new GrantStaffArgsError(`--role must be one of ${PLATFORM_ROLES.join(", ")}`);
  const appEnv = AppEnvSchema.safeParse(env["APP_ENV"]);
  if (!appEnv.success) throw new GrantStaffArgsError("APP_ENV must be local, dev, staging or prod");
  checkEnvironment(appEnv.data, flags["--project"]);
  return { projectId: flags["--project"], email: flags["--email"], role: role.data, appEnv: appEnv.data };
};
