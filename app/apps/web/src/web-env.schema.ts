import { type EnvIssue, InvalidEnvError, loadServicesEnv, type ServicesEnv } from "@core/services";
import { z } from "zod";

/** Variables only the web app reads, on top of the services env. */
export const WebOnlyEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type WebEnv = ServicesEnv & z.infer<typeof WebOnlyEnvSchema>;

const toEnvIssues = (error: z.ZodError): EnvIssue[] =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));

/**
 * Composes the services env (Firebase, Postgres, AI mode) with the web-only
 * schema and reports every invalid variable of both at once.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadWebEnv = (source: Record<string, string | undefined>): WebEnv => {
  const web = WebOnlyEnvSchema.safeParse(source);
  const webIssues = web.success ? [] : toEnvIssues(web.error);
  let services: ServicesEnv;
  try {
    services = loadServicesEnv(source);
  } catch (err: unknown) {
    if (err instanceof InvalidEnvError) throw new InvalidEnvError([...err.issues, ...webIssues], { cause: err });
    throw err;
  }
  if (!web.success) throw new InvalidEnvError(webIssues);
  return { ...services, ...web.data };
};
