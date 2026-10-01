import { CorsOriginListSchema, type EnvIssue, InvalidEnvError, loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/**
 * Local-only default: the desktop Vite dev server plus the Tauri webview origins
 * (`tauri://localhost` on macOS/Linux, `http://tauri.localhost` on Windows).
 */
const LOCAL_CORS_ALLOWED_ORIGINS = ["http://localhost:1420", "tauri://localhost", "http://tauri.localhost"];

/** `mastra dev` default port on the developer machine. */
const LOCAL_MASTRA_URL = "http://localhost:4111";

// Comma-separated second factors the UI offers (same shape as the server's MFA_FACTORS).
const MfaFactorListSchema = z
  .string()
  .transform((value) => [...new Set(value.split(",").map((item) => item.trim()).filter((item) => item !== ""))])
  .pipe(z.array(z.enum(["totp", "phone"])).min(1));

/** Variables only the web app reads, on top of the services env. */
export const WebOnlyEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  // Public client config (inlined into the browser bundle, SP2 Task 18); validated here too so a
  // wrong deployment fails at boot instead of in the browser.
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "dev", "staging", "prod"]).optional(),
  NEXT_PUBLIC_MFA_FACTORS: MfaFactorListSchema.optional(),
  // Auth Emulator origin of the browser SDK (local only); the CSP allows it (decision 0016).
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: z.url({ protocol: /^http$/ }).optional(),
  // Origins allowed to call /v1 cross-origin (never `*`); empty string = CORS off.
  CORS_ALLOWED_ORIGINS: CorsOriginListSchema.optional(),
  // Private Mastra service the /v1 gateway calls (SP3 spec §4.1); required outside local.
  MASTRA_URL: z.url().optional(),
  // Cloud Run audience of the Mastra service for X-Serverless-Authorization; required outside local.
  MASTRA_AUDIENCE: z.url().optional(),
  // Cloud Storage bucket of uploads (SP3 files context); local defaults to the emulator's
  // default bucket of the demo project, required outside local.
  FILES_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, { error: "expected a bucket name" }).optional(),
});

type WebOnlyEnv = z.infer<typeof WebOnlyEnvSchema>;

// Both environments: the client bundle names the same environment as the server.
const publicIssues = (env: WebOnlyEnv & { APP_ENV: string }): EnvIssue[] => {
  const isLocal = env.APP_ENV === "local";
  const emulator = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  return [
    ...(env.NEXT_PUBLIC_APP_ENV === undefined ? [{ field: "NEXT_PUBLIC_APP_ENV", issue: "REQUIRED" }] : []),
    ...(env.NEXT_PUBLIC_APP_ENV !== undefined && env.NEXT_PUBLIC_APP_ENV !== env.APP_ENV ? [{ field: "NEXT_PUBLIC_APP_ENV", issue: "MISMATCH" }] : []),
    ...(isLocal && emulator === undefined ? [{ field: "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL", issue: "REQUIRED" }] : []),
    ...(!isLocal && emulator !== undefined ? [{ field: "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL", issue: "FORBIDDEN" }] : []),
  ];
};

// Remote environments must state these: a silent localhost default would ship dev
// origins to prod, and an http Mastra URL would send the caller's token in clear.
const remoteIssues = (env: WebOnlyEnv): EnvIssue[] => [
  ...(env.CORS_ALLOWED_ORIGINS === undefined ? [{ field: "CORS_ALLOWED_ORIGINS", issue: "REQUIRED" }] : []),
  ...(env.MASTRA_URL === undefined ? [{ field: "MASTRA_URL", issue: "REQUIRED" }] : []),
  ...(env.MASTRA_URL !== undefined && !env.MASTRA_URL.startsWith("https://") ? [{ field: "MASTRA_URL", issue: "HTTPS_REQUIRED" }] : []),
  ...(env.MASTRA_AUDIENCE === undefined ? [{ field: "MASTRA_AUDIENCE", issue: "REQUIRED" }] : []),
  ...(env.FILES_BUCKET === undefined ? [{ field: "FILES_BUCKET", issue: "REQUIRED" }] : []),
];

/**
 * Composes the services env (Firebase, Postgres, AI mode) with the web-only
 * schema and reports every invalid variable of both at once.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadWebEnv = (source: Record<string, string | undefined>) => {
  const env = loadServicesEnvWith(WebOnlyEnvSchema, source);
  const clientIssues = publicIssues(env);
  if (env.APP_ENV === "local") {
    if (clientIssues.length > 0) throw new InvalidEnvError(clientIssues);
    return {
      ...env,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ?? LOCAL_CORS_ALLOWED_ORIGINS,
      MASTRA_URL: env.MASTRA_URL ?? LOCAL_MASTRA_URL,
      FILES_BUCKET: env.FILES_BUCKET ?? `${env.FIREBASE_PROJECT_ID}.appspot.com`,
    };
  }
  const issues = [...clientIssues, ...remoteIssues(env)];
  if (issues.length > 0 || env.CORS_ALLOWED_ORIGINS === undefined || env.MASTRA_URL === undefined || env.FILES_BUCKET === undefined) {
    throw new InvalidEnvError(issues);
  }
  return { ...env, CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS, MASTRA_URL: env.MASTRA_URL, FILES_BUCKET: env.FILES_BUCKET };
};

export type WebEnv = ReturnType<typeof loadWebEnv>;
