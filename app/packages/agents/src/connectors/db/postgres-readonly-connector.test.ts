import { type Connector, ConnectorSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { CoreToolContext } from "../../tools/define-core-tool.ts";
import { assertPublicDatabaseHost, type PostgresConnectorRunner, postgresConnectorTools } from "./postgres-readonly-connector.ts";

const connector: Connector = ConnectorSchema.parse({
  id: "Pg4sK2lPq0WnR5tYu3bV",
  tenantId: "Jd8sK2lPq0WnR5tYu3bV",
  name: "warehouse",
  type: "postgres",
  status: "active",
  secretRef: "connector-Jd8sK2lPq0WnR5tYu3bV-Pg4sK2lPq0WnR5tYu3bV",
  toolPolicy: { allow: ["query"], readOnly: ["query"] },
  config: { allowedRelations: ["public.orders_summary"] },
  createdBy: "uA1b2C3d4E5f6G7h8I9j",
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
});

const DSN = "postgresql://reader:pw@db.example.com:5432/warehouse";
const ctx = { abortSignal: new AbortController().signal } as CoreToolContext;
const publicDns = () => Promise.resolve(["93.184.216.34"]);

const recordingRunner = (rows: Record<string, unknown>[]) => {
  const calls: Parameters<PostgresConnectorRunner>[0][] = [];
  const runner: PostgresConnectorRunner = (args) => {
    calls.push(args);
    return Promise.resolve(rows);
  };
  return { calls, runner };
};

describe("postgres read-only connector", () => {
  it("runs a guarded SELECT over an allowed relation with a row cap", async () => {
    const { calls, runner } = recordingRunner([{ n: 1 }, { n: 2 }, { n: 3 }]);
    const [tool] = postgresConnectorTools({ connector, dsn: DSN, runner, resolve: publicDns });
    expect(tool?.id).toBe("db.warehouse.query");
    expect(tool?.kind).toBe("read");
    const result = await tool?.execute({ sql: "SELECT count(*) AS n FROM public.orders_summary WHERE status = $1", params: ["paid"], limit: 2 }, ctx);
    expect(result).toEqual({ rows: [{ n: 1 }, { n: 2 }], rowCount: 2, truncated: true });
    expect(calls[0]).toMatchObject({ dsn: DSN, params: ["paid"], limit: 2 });
  });

  it("refuses relations outside the allowlist and writes before any connection", async () => {
    const { calls, runner } = recordingRunner([]);
    const [tool] = postgresConnectorTools({ connector, dsn: DSN, runner, resolve: publicDns });
    await expect(tool?.execute({ sql: "SELECT * FROM public.users" }, ctx)).rejects.toMatchObject({ code: "SQL_REJECTED" });
    await expect(tool?.execute({ sql: "UPDATE public.orders_summary SET x = 1" }, ctx)).rejects.toMatchObject({ code: "SQL_REJECTED" });
    expect(calls).toEqual([]);
  });

  it("refuses a database host that is private or an IP literal", async () => {
    await expect(assertPublicDatabaseHost("postgresql://u:p@10.0.0.4:5432/db", publicDns)).rejects.toThrow();
    await expect(assertPublicDatabaseHost(DSN, () => Promise.resolve(["127.0.0.1"]))).rejects.toThrow();
    await expect(assertPublicDatabaseHost(DSN, publicDns)).resolves.toBeUndefined();
  });

  it("offers no tool without a DSN secret or for another connector type", () => {
    expect(postgresConnectorTools({ connector, dsn: null })).toEqual([]);
  });
});
