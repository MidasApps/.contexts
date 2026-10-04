import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Connector } from "@core/contracts";
import { createPostgresClient, guardConnectorSql, wrapWithLimit } from "@core/services";
import { z } from "zod";
import { type CoreToolDefinition, defineCoreTool } from "../../tools/define-core-tool.ts";
import { toolFailure } from "../../tools/tool-errors.ts";
import { isNonPublicAddress, type ResolveHost } from "../../tools/web/url-guard.ts";

/**
 * Read-only SQL over a tenant-owned Postgres (spec §9, decision 0027): the semantic SQL
 * guard with the connector's `allowedRelations` (qualified names), a `READ ONLY`
 * transaction with a 5 s statement timeout and a row cap. The DSN is the connector's
 * secret; its host must resolve to public addresses (no SSRF into the platform network).
 * There is no row level security across tenants there, so only databases the tenant owns
 * may be registered (admins register them, `core.connector.write`).
 */

export const DB_QUERY_PERMISSION = "core.catalog.query";
export const DB_DEFAULT_LIMIT = 100;
export const DB_MAX_LIMIT = 1000;
const MAX_PARAMS = 20;

export type PostgresConnectorRunner = (args: {
  readonly dsn: string;
  readonly sql: string;
  readonly params: readonly (string | number | boolean | null)[];
  readonly limit: number;
}) => Promise<readonly Readonly<Record<string, unknown>>[]>;

/** The default runner: one short-lived connection, `BEGIN READ ONLY`, 5 s statement timeout. */
export const runReadOnlyQuery: PostgresConnectorRunner = async ({ dsn, sql, params, limit }) => {
  const client = createPostgresClient({ DATABASE_URL: dsn }, { max: 1, connectTimeoutSeconds: 10 });
  try {
    return await client.begin("read only", async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '5s'");
      return tx.unsafe(wrapWithLimit(sql, limit + 1), [...params]);
    });
  } finally {
    await client.end({ timeout: 1 });
  }
};

const defaultResolve: ResolveHost = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/** @throws when the DSN host is an IP literal, local, or resolves to a non-public address. */
export const assertPublicDatabaseHost = async (dsn: string, resolve: ResolveHost = defaultResolve): Promise<void> => {
  const host = new URL(dsn).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "" || isIP(host) !== 0 || !host.includes(".")) throw new Error("DATABASE_HOST_NOT_PUBLIC");
  const addresses = await resolve(host);
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) throw new Error("DATABASE_HOST_NOT_PUBLIC");
};

const keyPart = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, "-");
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `x${cleaned}`;
};

/** The `db.<connector>.query` tool of a Postgres connector (none for other types or without a DSN). */
export const postgresConnectorTools = (args: {
  readonly connector: Connector;
  readonly dsn: string | null;
  readonly runner?: PostgresConnectorRunner;
  readonly resolve?: ResolveHost;
}): CoreToolDefinition[] => {
  const { connector, dsn } = args;
  if (connector.type !== "postgres" || dsn === null) return [];
  const relations = new Set(connector.config.allowedRelations);
  const toolId = `db.${keyPart(connector.name)}.query`;
  return [
    defineCoreTool({
      id: toolId,
      description: `Runs one read-only SELECT on the ${connector.name} database; only ${[...relations].join(", ").slice(0, 300)} may be read. Use bound parameters ($1…).`,
      kind: "read",
      permission: DB_QUERY_PERMISSION,
      inputSchema: z.strictObject({
        sql: z.string().min(1).max(10_000).describe("One SELECT over the allowed schema.relation names."),
        params: z
          .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .max(MAX_PARAMS)
          .optional()
          .describe("Values for $1, $2, ..."),
        limit: z.int().min(1).max(DB_MAX_LIMIT).optional().describe("Rows to return (default 100, at most 1000)."),
      }),
      outputSchema: z.strictObject({
        rows: z.array(z.record(z.string(), z.unknown())),
        rowCount: z.int(),
        truncated: z.boolean(),
      }),
      audit: { action: "SEMANTIC_QUERY_EXECUTED" },
      execute: async (input) => {
        const params = input.params ?? [];
        const guarded = await guardConnectorSql({
          sql: input.sql,
          allowedRelations: relations,
          paramCount: params.length,
        });
        if (!guarded.ok)
          throw toolFailure(toolId, "SQL_REJECTED", "The query is not allowed on this connector.", {
            reason: guarded.error.reason,
          });
        await assertPublicDatabaseHost(dsn, args.resolve).catch((error: unknown) => {
          throw toolFailure(toolId, "CONNECTOR_UNAVAILABLE", "The connector database is not reachable.", {
            reason: error instanceof Error ? error.message : "UNKNOWN",
          });
        });
        const limit = input.limit ?? DB_DEFAULT_LIMIT;
        const rows = await (args.runner ?? runReadOnlyQuery)({ dsn, sql: guarded.data.sql, params, limit });
        const truncated = rows.length > limit;
        const kept = rows.slice(0, limit).map((row) => ({ ...row }));
        return { rows: kept, rowCount: kept.length, truncated };
      },
    }),
  ];
};
