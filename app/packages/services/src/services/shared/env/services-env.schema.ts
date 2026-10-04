import { z } from "zod";
import { parseDatabaseUrl, socketFilePath } from "../postgres/database-url.ts";
import { toEnvIssues } from "./env-issues.ts";
import { InvalidEnvError } from "./invalid-env-error.ts";

/**
 * Env shared by server code that talks to Firebase and Postgres
 * (contracts/secrets.md §5.4). Apps compose it into their own `src/env.ts`
 * and parse once at boot; nothing else reads `process.env`.
 */
const HostPortSchema = z.string().regex(/^[\w.-]+:\d{1,5}$/, { error: "expected host:port" });

const EMULATOR_HOST_KEYS = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "PUBSUB_EMULATOR_HOST",
] as const;
const REQUIRED_LOCAL_EMULATORS = ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"] as const;
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);
const DEMO_PROJECT_PREFIX = "demo-";
// Cloud Run mounts Cloud SQL sockets under /cloudsql/<project:region:instance>.
const CLOUD_SQL_SOCKET_DIR = /^\/cloudsql\/[\w.-]+:[\w-]+:[\w-]+$/;
// sun_path holds 108 bytes including the terminating NUL.
const MAX_SOCKET_PATH_LENGTH = 107;

// TCP URL, or the Cloud SQL socket form that z.url() cannot parse (decision 0023).
const DatabaseUrlSchema = z
  .string()
  .refine((value) => parseDatabaseUrl(value) !== undefined, { error: "expected a postgres URL" });

const daysSchema = (args: { max: number; fallback: number }) =>
  z.coerce.number().int().min(1).max(args.max).default(args.fallback);

// Boolean env values are the literal strings "true"/"false"; anything else is a typo.
const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

// Comma-separated list; order kept, duplicates dropped (SP1 spec §3.4, decision 0007).
const MfaFactorsSchema = z
  .string()
  .transform((value) => [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    ),
  ])
  .pipe(z.array(z.enum(["totp", "phone"])).min(1));

const BaseServicesEnvSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "staging", "prod"]),
  FIREBASE_PROJECT_ID: z.string().min(1),
  DATABASE_URL: DatabaseUrlSchema,
  // Real provider by default; `fake` is the explicit CI/test/offline switch (spec §11).
  AI_MODE: z.enum(["real", "fake"]).default("real"),
  FIREBASE_AUTH_EMULATOR_HOST: HostPortSchema.optional(),
  FIRESTORE_EMULATOR_HOST: HostPortSchema.optional(),
  FIREBASE_STORAGE_EMULATOR_HOST: HostPortSchema.optional(),
  PUBSUB_EMULATOR_HOST: HostPortSchema.optional(),
  // Identity and access settings (SP1 spec §8; decisions 0007, 0008).
  SESSION_MAX_AGE_DAYS: daysSchema({ max: 14, fallback: 5 }),
  DESKTOP_SESSION_MAX_AGE_DAYS: daysSchema({ max: 90, fallback: 30 }),
  API_KEY_PREFIX: z
    .string()
    .regex(/^[a-z]{2,12}$/, { error: "expected 2-12 lower-case letters" })
    .default("core"),
  ORGANIZATION_SELF_SERVE: BooleanStringSchema.default(true),
  MFA_FACTORS: MfaFactorsSchema.default(["totp"]),
  // Proxies in front of the app that append X-Forwarded-For entries (decision 0030 §2).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

type BaseServicesEnv = z.infer<typeof BaseServicesEnvSchema>;
type RefinementContext = z.core.$RefinementCtx<BaseServicesEnv>;

const flag = (ctx: RefinementContext, field: keyof BaseServicesEnv, message: string) => {
  ctx.addIssue({ code: "custom", path: [field], message });
};

// Local never reaches a remote project (processes/environments.md §9).
const assertLocalStaysLocal = (env: BaseServicesEnv, ctx: RefinementContext) => {
  if (!env.FIREBASE_PROJECT_ID.startsWith(DEMO_PROJECT_PREFIX)) {
    flag(ctx, "FIREBASE_PROJECT_ID", "local must use a demo-* project");
  }
  for (const key of REQUIRED_LOCAL_EMULATORS) {
    if (!env[key]) flag(ctx, key, "local requires this emulator");
  }
  // Zod 4 still runs this refinement after a field issue; an unparsable URL is
  // already reported by the field schema, so it is skipped here.
  const target = parseDatabaseUrl(env.DATABASE_URL);
  if (target === undefined) return;
  if (target.kind === "socket" || !LOCAL_DATABASE_HOSTS.has(target.hostname)) {
    flag(ctx, "DATABASE_URL", "local must use the local Postgres container");
  }
};

// Remote environments never talk to emulators or demo projects.
const assertRemoteHasNoEmulators = (env: BaseServicesEnv, ctx: RefinementContext) => {
  if (env.FIREBASE_PROJECT_ID.startsWith(DEMO_PROJECT_PREFIX)) {
    flag(ctx, "FIREBASE_PROJECT_ID", "demo-* projects are local only");
  }
  for (const key of EMULATOR_HOST_KEYS) {
    if (env[key]) flag(ctx, key, "emulators are local only");
  }
};

// Outside local the socket form is Cloud SQL only (SP0 follow-up #3).
const assertRemoteSocketIsCloudSql = (env: BaseServicesEnv, ctx: RefinementContext) => {
  const target = parseDatabaseUrl(env.DATABASE_URL);
  if (target?.kind !== "socket") return;
  if (!CLOUD_SQL_SOCKET_DIR.test(target.socketDir) || socketFilePath(target).length > MAX_SOCKET_PATH_LENGTH) {
    flag(ctx, "DATABASE_URL", "socket DSN must use /cloudsql/<project:region:instance> within the unix path limit");
  }
};

export const ServicesEnvSchema = BaseServicesEnvSchema.superRefine((env, ctx) => {
  if (env.APP_ENV === "local") assertLocalStaysLocal(env, ctx);
  else {
    assertRemoteHasNoEmulators(env, ctx);
    assertRemoteSocketIsCloudSql(env, ctx);
  }
});

export type ServicesEnv = z.infer<typeof ServicesEnvSchema>;

/**
 * Parses the env once at boot (fail-fast by design).
 * @param source usually `process.env`, read only by the app's `src/env.ts`.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadServicesEnv = (source: Record<string, string | undefined>): ServicesEnv => {
  const result = ServicesEnvSchema.safeParse(source);
  if (result.success) return result.data;
  throw new InvalidEnvError(toEnvIssues(result.error));
};
