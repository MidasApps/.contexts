import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

// Needs the compose container (`docker compose up -d --wait` in app/).
// DATABASE_URL overrides the default, e.g. when POSTGRES_PORT is not 5432.
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
});

afterAll(async () => {
  await sql.end();
});

describe("local postgres bootstrap (infra/postgres/init)", () => {
  it("enables the pgvector extension at 0.8.6", async () => {
    const rows = await sql<{ extversion: string }[]>`
      SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    expect(rows.map((row) => row.extversion)).toEqual(["0.8.6"]);
  });

  it("creates the mastra, ai and semantic schemas", async () => {
    const rows = await sql<{ schema_name: string }[]>`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('mastra', 'ai', 'semantic')
      ORDER BY schema_name`;
    expect(rows.map((row) => row.schema_name)).toEqual(["ai", "mastra", "semantic"]);
  });

  it("creates semantic roles that cannot log in or bypass row level security", async () => {
    const rows = await sql<{ rolname: string; rolcanlogin: boolean; rolbypassrls: boolean }[]>`
      SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles
      WHERE rolname IN ('semantic_owner', 'semantic_reader')
      ORDER BY rolname`;
    expect(rows).toEqual([
      { rolname: "semantic_owner", rolcanlogin: false, rolbypassrls: false },
      { rolname: "semantic_reader", rolcanlogin: false, rolbypassrls: false },
    ]);
  });

  it("gives semantic_owner the semantic schema and semantic_reader only usage on it", async () => {
    const [row] = await sql<{ owner: string; readerUsage: boolean; readerCreate: boolean }[]>`
      SELECT pg_get_userbyid(nspowner) AS owner,
             has_schema_privilege('semantic_reader', 'semantic', 'USAGE') AS "readerUsage",
             has_schema_privilege('semantic_reader', 'semantic', 'CREATE') AS "readerCreate"
      FROM pg_namespace WHERE nspname = 'semantic'`;
    expect(row).toEqual({ owner: "semantic_owner", readerUsage: true, readerCreate: false });
  });
});
