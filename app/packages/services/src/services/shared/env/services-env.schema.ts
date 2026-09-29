import { z } from "zod";
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

const BaseServicesEnvSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "staging", "prod"]),
  FIREBASE_PROJECT_ID: z.string().min(1),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Real provider by default; `fake` is the explicit CI/test/offline switch (spec §11).
  AI_MODE: z.enum(["real", "fake"]).default("real"),
  FIREBASE_AUTH_EMULATOR_HOST: HostPortSchema.optional(),
  FIRESTORE_EMULATOR_HOST: HostPortSchema.optional(),
  FIREBASE_STORAGE_EMULATOR_HOST: HostPortSchema.optional(),
  PUBSUB_EMULATOR_HOST: HostPortSchema.optional(),
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
  if (!URL.canParse(env.DATABASE_URL)) return;
  if (!LOCAL_DATABASE_HOSTS.has(new URL(env.DATABASE_URL).hostname)) {
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

export const ServicesEnvSchema = BaseServicesEnvSchema.superRefine((env, ctx) => {
  if (env.APP_ENV === "local") assertLocalStaysLocal(env, ctx);
  else assertRemoteHasNoEmulators(env, ctx);
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
  const issues = result.error.issues.map((issue) => ({
    field: issue.path.map(String).join("."),
    issue: issue.code.toUpperCase(),
  }));
  throw new InvalidEnvError(issues);
};
