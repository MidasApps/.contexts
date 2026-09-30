import { CorsOriginListSchema, type EnvIssue, InvalidEnvError, loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/**
 * Local-only default: the desktop Vite dev server plus the Tauri webview origins
 * (`tauri://localhost` on macOS/Linux, `http://tauri.localhost` on Windows).
 */
const LOCAL_CORS_ALLOWED_ORIGINS = ["http://localhost:1420", "tauri://localhost", "http://tauri.localhost"];

/** `mastra dev` default port on the developer machine. */
const LOCAL_MASTRA_URL = "http://localhost:4111";

/** Variables only the web app reads, on top of the services env. */
export const WebOnlyEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  // Origins allowed to call /v1 cross-origin (never `*`); empty string = CORS off.
  CORS_ALLOWED_ORIGINS: CorsOriginListSchema.optional(),
  // Private Mastra service the /v1 gateway calls (SP3 spec §4.1); required outside local.
  MASTRA_URL: z.url().optional(),
  // Cloud Run audience of the Mastra service for X-Serverless-Authorization; required outside local.
  MASTRA_AUDIENCE: z.url().optional(),
});

type WebOnlyEnv = z.infer<typeof WebOnlyEnvSchema>;

// Remote environments must state these: a silent localhost default would ship dev
// origins to prod, and an http Mastra URL would send the caller's token in clear.
const remoteIssues = (env: WebOnlyEnv): EnvIssue[] => [
  ...(env.CORS_ALLOWED_ORIGINS === undefined ? [{ field: "CORS_ALLOWED_ORIGINS", issue: "REQUIRED" }] : []),
  ...(env.MASTRA_URL === undefined ? [{ field: "MASTRA_URL", issue: "REQUIRED" }] : []),
  ...(env.MASTRA_URL !== undefined && !env.MASTRA_URL.startsWith("https://") ? [{ field: "MASTRA_URL", issue: "HTTPS_REQUIRED" }] : []),
  ...(env.MASTRA_AUDIENCE === undefined ? [{ field: "MASTRA_AUDIENCE", issue: "REQUIRED" }] : []),
];

/**
 * Composes the services env (Firebase, Postgres, AI mode) with the web-only
 * schema and reports every invalid variable of both at once.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadWebEnv = (source: Record<string, string | undefined>) => {
  const env = loadServicesEnvWith(WebOnlyEnvSchema, source);
  if (env.APP_ENV === "local") {
    return { ...env, CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ?? LOCAL_CORS_ALLOWED_ORIGINS, MASTRA_URL: env.MASTRA_URL ?? LOCAL_MASTRA_URL };
  }
  const issues = remoteIssues(env);
  if (issues.length > 0 || env.CORS_ALLOWED_ORIGINS === undefined || env.MASTRA_URL === undefined) throw new InvalidEnvError(issues);
  return { ...env, CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS, MASTRA_URL: env.MASTRA_URL };
};

export type WebEnv = ReturnType<typeof loadWebEnv>;
