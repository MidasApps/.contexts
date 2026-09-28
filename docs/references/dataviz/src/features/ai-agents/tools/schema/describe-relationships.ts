import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

const InputSchema = z.object({
  tables: z.array(z.string()).nullable(),
}).strict();

interface RelationEdge {
  from: string;
  column: string;
  to: string;
  toColumn: string;
  confidence: number;
}

interface CacheEntry {
  edges: RelationEdge[];
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function __resetRelationshipsCache(): void {
  cache.clear();
}

const SAFE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function safeIdent(name: string): string {
  if (!SAFE_NAME_RE.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return name;
}

export function createDescribeRelationshipsTool(ctx: { dataset: string; clientId: string }) {
  return tool({
    description:
      'Descobre relacionamentos heurísticos entre tabelas via convenção *_id + sample JOINs. Cache 1h.',
    inputSchema: InputSchema,
    execute: async (input) => {
      const cacheKey = `${ctx.dataset}|${(input.tables ?? []).join(',')}`;
      const now = Date.now();
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return { edges: cached.edges, cacheHit: true };
      }

      const client = getBigQueryClient();
      const tables = input.tables ?? [];
      const schemas: Array<{ table: string; columns: Array<{ name: string; type: string }> }> = [];
      for (const t of tables) {
        try {
          safeIdent(t);
          const [meta] = await client.dataset(ctx.dataset).table(t).getMetadata();
          const cols = (meta?.schema?.fields ?? []) as Array<{ name?: string; type?: string }>;
          schemas.push({
            table: t,
            columns: cols.map((c) => ({ name: c.name ?? '', type: c.type ?? '' })),
          });
        } catch {
          /* skip */
        }
      }

      const edges: RelationEdge[] = [];
      for (const s of schemas) {
        for (const col of s.columns) {
          const m = col.name.match(/^(.+)_id$/);
          if (!m) continue;
          const stem = m[1]!;
          const candidates = [stem, `${stem}s`];
          for (const cand of candidates) {
            const target = schemas.find((x) => x.table === cand);
            if (!target) continue;
            try {
              const sql = `SELECT COUNT(*) AS hits FROM (SELECT ${safeIdent(col.name)} FROM \`${ctx.dataset}\`.\`${safeIdent(s.table)}\` LIMIT 1000) a JOIN \`${ctx.dataset}\`.\`${safeIdent(cand)}\` b ON a.${safeIdent(col.name)} = b.id`;
              const [rows] = await client.query({ query: sql, useLegacySql: false, maximumBytesBilled: String(maxBytesBilled()) });
              const hits = Number((rows as Array<Record<string, unknown>>)[0]?.hits ?? 0);
              const confidence = Math.min(1, hits / 1000);
              if (hits > 0) {
                edges.push({
                  from: s.table,
                  column: col.name,
                  to: cand,
                  toColumn: 'id',
                  confidence,
                });
              }
            } catch {
              /* skip */
            }
          }
        }
      }
      cache.set(cacheKey, { edges, expiresAt: now + TTL_MS });
      return { edges, cacheHit: false };
    },
  });
}
