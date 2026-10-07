import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPostgresClient } from "@core/services";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyModuleMigrations, ModuleSchemaConventionError } from "./apply-module-migrations.ts";
import { type ModuleMigrations, moduleSqlNames } from "./module-migrations.ts";

// Needs the compose container (`docker compose up -d --wait`). It creates and drops its own
// schemas, roles and journal tables, so it never touches the core's.
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 1 });
const work = mkdtempSync(path.join(tmpdir(), "module-migrations-"));

type Names = ReturnType<typeof moduleSqlNames>;
const MODULE_IDS = ["zz-migrate-ok", "zz-migrate-unforced", "zz-migrate-ddl"] as const;

const createRole = (role: string): string => `DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE ${role} NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;`;

const compliant = ({ schema, runtimeRole }: Names): string[] => [
  `CREATE SCHEMA ${schema};`,
  `CREATE TABLE ${schema}.items (id uuid PRIMARY KEY DEFAULT uuidv7(), tenant_id text NOT NULL);`,
  `ALTER TABLE ${schema}.items ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE ${schema}.items FORCE ROW LEVEL SECURITY;`,
  `CREATE POLICY items_tenant_isolation ON ${schema}.items
     USING (tenant_id = current_setting('app.tenant_id', true))
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true));`,
  createRole(runtimeRole),
  `GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole};`,
  `GRANT SELECT, INSERT ON ${schema}.items TO ${runtimeRole};`,
];

/** A module folder with one migration; `when: 1` is older than every migration of the core. */
const fixture = (moduleId: (typeof MODULE_IDS)[number], statements: (names: Names) => string[]): ModuleMigrations => {
  const names = moduleSqlNames(moduleId);
  const folder = path.join(work, moduleId);
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const journal = {
    version: "7",
    dialect: "postgresql",
    entries: [{ idx: 0, version: "7", when: 1, tag: "0000_fixture", breakpoints: true }],
  };
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
  writeFileSync(path.join(folder, "0000_fixture.sql"), statements(names).join("\n--> statement-breakpoint\n"));
  return { moduleId, ...names, folder };
};

const dropFixtures = async (): Promise<void> => {
  for (const moduleId of MODULE_IDS) {
    const { schema, runtimeRole, journalTable } = moduleSqlNames(moduleId);
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.unsafe(`DROP TABLE IF EXISTS migrations.${journalTable}`);
    await sql.unsafe(`DROP ROLE IF EXISTS ${runtimeRole}`);
  }
};

const journalRows = async (table: string): Promise<number> => {
  const rows = await sql.unsafe<{ n: string }[]>(`SELECT count(*) AS n FROM migrations.${table}`);
  return Number(rows[0]?.n ?? 0);
};

beforeAll(dropFixtures);
afterAll(async () => {
  await dropFixtures();
  await sql.end();
  rmSync(work, { recursive: true, force: true });
});

describe("applyModuleMigrations", () => {
  it("applies a migration older than the core's newest and records it in the module's own journal", async () => {
    const module = fixture("zz-migrate-ok", compliant);
    await applyModuleMigrations(sql, module);
    expect(await journalRows(module.journalTable)).toBe(1);
    const rows = await sql`SELECT to_regclass(${`${module.schema}.items`}::text) IS NOT NULL AS present`;
    expect(rows[0]?.["present"]).toBe(true);
  });

  it("applies nothing on a second run", async () => {
    const module = fixture("zz-migrate-ok", compliant);
    await applyModuleMigrations(sql, module);
    await applyModuleMigrations(sql, module);
    expect(await journalRows(module.journalTable)).toBe(1);
  });

  it("refuses a table without forced row level security, naming it", async () => {
    const module = fixture("zz-migrate-unforced", (names) =>
      compliant(names).filter((statement) => !statement.includes("FORCE ROW LEVEL SECURITY")),
    );
    await expect(applyModuleMigrations(sql, module)).rejects.toMatchObject({
      code: "MODULE_SCHEMA_CONVENTION",
      violations: [`table ${module.schema}.items has no forced row level security`],
    });
  });

  it("refuses a runtime role that may create objects in the schema, on every run", async () => {
    const module = fixture("zz-migrate-ddl", (names) => [
      ...compliant(names),
      `GRANT CREATE ON SCHEMA ${names.schema} TO ${names.runtimeRole};`,
    ]);
    await expect(applyModuleMigrations(sql, module)).rejects.toBeInstanceOf(ModuleSchemaConventionError);
    await expect(applyModuleMigrations(sql, module)).rejects.toMatchObject({
      violations: [`role ${module.runtimeRole} may create objects in schema ${module.schema}`],
    });
  });
});
