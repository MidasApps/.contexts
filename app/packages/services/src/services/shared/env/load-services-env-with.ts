import type { z } from "zod";
import { type EnvIssue, InvalidEnvError } from "./invalid-env-error.ts";
import { loadServicesEnv, type ServicesEnv } from "./services-env.schema.ts";

const toEnvIssues = (error: z.ZodError): EnvIssue[] =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));

/**
 * Composes the services env with an app's own variables (contracts/secrets.md
 * §5.4): each app's `src/env.ts` calls this once at boot.
 * @param appSchema variables only this app reads; defaults apply.
 * @param source usually `process.env`.
 * @throws {InvalidEnvError} naming every invalid variable of both schemas, never its value.
 */
export const loadServicesEnvWith = <TSchema extends z.ZodType<object>>(
  appSchema: TSchema,
  source: Record<string, string | undefined>,
): ServicesEnv & z.infer<TSchema> => {
  const app = appSchema.safeParse(source);
  const appIssues = app.success ? [] : toEnvIssues(app.error);
  let services: ServicesEnv;
  try {
    services = loadServicesEnv(source);
  } catch (err: unknown) {
    if (err instanceof InvalidEnvError) throw new InvalidEnvError([...err.issues, ...appIssues], { cause: err });
    throw err;
  }
  if (!app.success) throw new InvalidEnvError(appIssues);
  return { ...services, ...app.data };
};
