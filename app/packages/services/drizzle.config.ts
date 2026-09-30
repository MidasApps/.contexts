import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit (decision 0023): `pnpm db:generate` writes SQL migrations from the
 * contexts' Drizzle tables into `app/infra/postgres/migrations` (committed);
 * `pnpm db:migrate` (app/scripts/db-migrate.ts) applies them. No credentials
 * here: generation needs no database.
 */
// drizzle-kit's config loader requires a default export.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/services/shared/postgres/drizzle-schemas.ts", "./src/services/*/adapters/driven/drizzle-schema.ts"],
  out: "../../infra/postgres/migrations",
  // Journal table in the reserved `migrations` schema (contracts/postgres.md).
  migrations: { schema: "migrations", table: "drizzle_migrations" },
});
