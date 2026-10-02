import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const APP_ENVS = ["local", "dev", "staging", "prod"] as const;
const MFA_FACTORS = ["totp", "phone"] as const;

const isOrigin = (value: string): boolean => new URL(value).origin === value;
const isLoopback = (value: string): boolean => LOOPBACK_HOSTS.has(new URL(value).hostname);

// The API base is an origin (scheme://host[:port]): `/v1/...` is appended by
// the client, and the Tauri CSP `connect-src` is derived from the same value.
const ApiOriginSchema = z
  .url({ protocol: /^https?$/, error: "expected an http(s) URL" })
  .transform((value) => value.replace(/\/$/, ""))
  .refine(isOrigin, { error: "expected an origin without path" })
  .refine((value) => new URL(value).protocol === "https:" || isLoopback(value), { error: "plain http is allowed for loopback only" });

// Vite env files cannot unset a variable, so an empty value means "absent".
const emptyAsUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

/** Emulator origin (Auth: follow-up #12c; Storage: local uploads): plain http on loopback only, never a remote host. */
const EmulatorOriginSchema = z.preprocess(
  emptyAsUndefined,
  z
    .url({ protocol: /^http$/, error: "expected an http URL" })
    .transform((value) => value.replace(/\/$/, ""))
    .refine(isOrigin, { error: "expected an origin without path" })
    .refine(isLoopback, { error: "the emulator runs on loopback only" })
    .optional(),
);

/** `totp,phone` → `["totp", "phone"]`; empty → no second factor offered. */
const MfaFactorListSchema = z
  .string()
  .transform((value) => value.split(",").map((factor) => factor.trim()).filter((factor) => factor !== ""))
  .pipe(z.array(z.enum(MFA_FACTORS)));

/**
 * Client-side env (contracts/secrets.md §5.3–5.4): public VITE_* values only,
 * validated once at startup and at build time (fail closed). Nothing here may
 * ever be a secret: the Firebase web API key is a public identifier.
 */
export const DesktopEnvSchema = z
  .object({
    VITE_API_URL: ApiOriginSchema,
    VITE_APP_ENV: z.enum(APP_ENVS),
    VITE_FIREBASE_API_KEY: z.string().min(1),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1),
    VITE_AUTH_EMULATOR_URL: EmulatorOriginSchema,
    // Where local uploads send their bytes (the files API answers a Storage Emulator URL in
    // local). Only the Tauri CSP reads it; optional, because a local build may not upload.
    VITE_STORAGE_EMULATOR_URL: EmulatorOriginSchema,
    VITE_MFA_FACTORS: MfaFactorListSchema,
    // Open sign-up page (decision 0050); unset = invitations only.
    VITE_SELF_SERVE_SIGN_UP: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  })
  .refine((env) => (env.VITE_APP_ENV === "local") === (env.VITE_AUTH_EMULATOR_URL !== undefined), {
    error: "VITE_AUTH_EMULATOR_URL is required in local and forbidden elsewhere",
    path: ["VITE_AUTH_EMULATOR_URL"],
  })
  .refine((env) => env.VITE_APP_ENV === "local" || env.VITE_STORAGE_EMULATOR_URL === undefined, {
    error: "VITE_STORAGE_EMULATOR_URL is allowed in local only",
    path: ["VITE_STORAGE_EMULATOR_URL"],
  });

export type DesktopEnv = z.infer<typeof DesktopEnvSchema>;

/** Startup failure: the bundled env does not satisfy the schema. */
export class InvalidDesktopEnvError extends Error {
  readonly code = "INVALID_ENV";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    // Names only, never values (mirrors the server env loaders).
    super(`invalid environment: ${fields.join(", ")}`);
    this.name = "InvalidDesktopEnvError";
    this.fields = fields;
  }
}

/**
 * @param source `import.meta.env` (or Vite's `loadEnv` output in scripts).
 * @throws {InvalidDesktopEnvError} naming each invalid variable.
 */
export const loadDesktopEnv = (source: Record<string, unknown>): DesktopEnv => {
  const result = DesktopEnvSchema.safeParse(source);
  if (result.success) return result.data;
  // `VITE_MFA_FACTORS.0` → `VITE_MFA_FACTORS`: the variable is what the operator fixes.
  throw new InvalidDesktopEnvError([...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "")))]);
};
