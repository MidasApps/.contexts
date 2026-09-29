import { InvalidEnvError, ServicesEnvSchema, toEnvIssues } from "@core/services";
import { z } from "zod";

/**
 * Env of the Functions codebase (contracts/secrets.md §5.4). It does not
 * compose the services env: Firebase reserves the `FIREBASE_` prefix in
 * Functions `.env` files, and no function here talks to Postgres yet. Add a
 * variable only when a function reads it; secrets go through `defineSecret`.
 */
export const FunctionsEnvSchema = z.object({
  APP_ENV: ServicesEnvSchema.shape.APP_ENV,
});

export type FunctionsEnv = z.infer<typeof FunctionsEnvSchema>;

/**
 * Parses the env once at boot (fail-fast by design).
 * @param source usually `process.env`, read only by `src/env.ts`.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadFunctionsEnv = (source: Record<string, string | undefined>): FunctionsEnv => {
  const result = FunctionsEnvSchema.safeParse(source);
  if (result.success) return result.data;
  throw new InvalidEnvError(toEnvIssues(result.error));
};
