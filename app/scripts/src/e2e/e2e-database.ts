import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createPostgresClient } from "@core/services";

/** Postgres identifiers the e2e run may create: lower-case, no quoting needed. */
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
/** Database every cluster has; `CREATE DATABASE` runs from it. */
const MAINTENANCE_DATABASE = "postgres";
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Thrown before any statement runs when the e2e database is not a local scratch one. */
export class UnsafeE2eDatabaseError extends Error {
  readonly code = "UNSAFE_E2E_DATABASE";
  constructor(reason: string) {
    super(`refusing to prepare the e2e database: ${reason}`);
    this.name = "UnsafeE2eDatabaseError";
  }
}

export type E2eDatabaseTarget = { readonly name: string; readonly maintenanceUrl: string };

/**
 * The database a local TCP `DATABASE_URL` names and the URL of the maintenance database beside it.
 * @throws {UnsafeE2eDatabaseError} for a remote host or a name that would need quoting.
 */
export const resolveE2eDatabaseTarget = (databaseUrl: string): E2eDatabaseTarget => {
  const url = URL.canParse(databaseUrl) ? new URL(databaseUrl) : undefined;
  if (url === undefined || !/^postgres(ql)?:$/.test(url.protocol)) throw new UnsafeE2eDatabaseError("DATABASE_URL is not a postgres URL");
  if (!LOCAL_HOSTS.has(url.hostname)) throw new UnsafeE2eDatabaseError("DATABASE_URL is not the local Postgres container");
  const name = url.pathname.slice(1);
  if (!DATABASE_NAME.test(name) || name === MAINTENANCE_DATABASE) throw new UnsafeE2eDatabaseError("the database name is not a scratch name");
  const maintenance = new URL(url);
  maintenance.pathname = `/${MAINTENANCE_DATABASE}`;
  return { name, maintenanceUrl: maintenance.toString() };
};

/**
 * Creates the e2e database when it is missing and applies the local bootstrap SQL of `initDir`
 * (extensions, schemas and roles; idempotent, the same files compose runs on an empty volume).
 * Migrations are a separate step (`scripts/db-migrate.ts`).
 * @returns `true` when the database was created by this call.
 */
export const ensureE2eDatabase = async (args: { databaseUrl: string; initDir: string }): Promise<boolean> => {
  const target = resolveE2eDatabaseTarget(args.databaseUrl);
  const maintenance = createPostgresClient({ DATABASE_URL: target.maintenanceUrl }, { max: 1 });
  let created = false;
  try {
    const existing = await maintenance`SELECT 1 FROM pg_database WHERE datname = ${target.name}`;
    if (existing.length === 0) {
      // The name matched DATABASE_NAME above; CREATE DATABASE takes no bind parameter.
      await maintenance.unsafe(`CREATE DATABASE ${target.name}`);
      created = true;
    }
  } finally {
    await maintenance.end();
  }
  const database = createPostgresClient({ DATABASE_URL: args.databaseUrl }, { max: 1 });
  try {
    const files = readdirSync(args.initDir).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) await database.unsafe(readFileSync(path.join(args.initDir, file), "utf8"));
  } finally {
    await database.end();
  }
  return created;
};
