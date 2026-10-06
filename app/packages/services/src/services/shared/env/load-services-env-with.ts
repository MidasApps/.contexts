import type { z } from "zod";
import { toEnvIssues } from "./env-issues.ts";
import { InvalidEnvError } from "./invalid-env-error.ts";
import { loadServicesEnv, type ServicesEnv, ServicesEnvSchema } from "./services-env.schema.ts";

/** Bug: an app schema redeclared a variable the services env owns. */
export class EnvKeyCollisionError extends Error {
  readonly code = "ENV_KEY_COLLISION";
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(`app env schema redeclares services variables: ${keys.join(", ")}`);
    this.name = "EnvKeyCollisionError";
    this.keys = keys;
  }
}

// The services schema owns its keys and their local/remote refinements; an app
// schema redeclaring one would silently override the validated value.
const assertNoServicesKeys = (appSchema: z.ZodObject) => {
  const collisions = Object.keys(appSchema.shape).filter((key) => key in ServicesEnvSchema.shape);
  if (collisions.length > 0) throw new EnvKeyCollisionError(collisions);
};

/**
 * Composes the services env with an app's own variables (contracts/secrets.md
 * §5.4): each app's `src/env.ts` calls this once at boot.
 * @param appSchema variables only this app reads (defaults apply); it must not
 *   redeclare a services variable.
 * @param source usually `process.env`.
 * @throws {EnvKeyCollisionError} when `appSchema` redeclares a services variable (bug).
 * @throws {InvalidEnvError} naming every invalid variable of both schemas, never its value.
 */
export const loadServicesEnvWith = <TSchema extends z.ZodObject>(
  appSchema: TSchema,
  source: Record<string, string | undefined>,
): ServicesEnv & z.infer<TSchema> => {
  assertNoServicesKeys(appSchema);
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
