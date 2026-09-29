import { CorsOriginListSchema, InvalidEnvError, loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/**
 * Local-only default: the desktop Vite dev server plus the Tauri webview origins
 * (`tauri://localhost` on macOS/Linux, `http://tauri.localhost` on Windows).
 */
const LOCAL_CORS_ALLOWED_ORIGINS = ["http://localhost:1420", "tauri://localhost", "http://tauri.localhost"];

/** Variables only the web app reads, on top of the services env. */
export const WebOnlyEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  // Origins allowed to call /v1 cross-origin (never `*`); empty string = CORS off.
  CORS_ALLOWED_ORIGINS: CorsOriginListSchema.optional(),
});

// Remote environments must state their allowlist: a silent localhost default
// would ship dev origins to prod.
const resolveCorsAllowedOrigins = (appEnv: string, configured: string[] | undefined): string[] => {
  if (configured !== undefined) return configured;
  if (appEnv === "local") return LOCAL_CORS_ALLOWED_ORIGINS;
  throw new InvalidEnvError([{ field: "CORS_ALLOWED_ORIGINS", issue: "REQUIRED" }]);
};

/**
 * Composes the services env (Firebase, Postgres, AI mode) with the web-only
 * schema and reports every invalid variable of both at once.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadWebEnv = (source: Record<string, string | undefined>) => {
  const env = loadServicesEnvWith(WebOnlyEnvSchema, source);
  return { ...env, CORS_ALLOWED_ORIGINS: resolveCorsAllowedOrigins(env.APP_ENV, env.CORS_ALLOWED_ORIGINS) };
};

export type WebEnv = ReturnType<typeof loadWebEnv>;
