import { loadServicesEnvWith } from "@core/services";
import { z } from "zod";

/** Variables only the web app reads, on top of the services env. */
export const WebOnlyEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

/**
 * Composes the services env (Firebase, Postgres, AI mode) with the web-only
 * schema and reports every invalid variable of both at once.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadWebEnv = (source: Record<string, string | undefined>) =>
  loadServicesEnvWith(WebOnlyEnvSchema, source);

export type WebEnv = ReturnType<typeof loadWebEnv>;
