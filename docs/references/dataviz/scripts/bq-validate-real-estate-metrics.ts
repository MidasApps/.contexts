#!/usr/bin/env tsx
/**
 * Executa as 268 receitas `imobiliaria.*` contra `imobiliaria_demo` no
 * BigQuery, resolvendo os placeholders com o binding identidade — o mesmo
 * que `seed-real-estate-client.mjs` grava — e os filtros de página com
 * valores fixos (fim = última foto, faixa = 12 meses, corretor = sem seleção).
 *
 * Reporta erro de compilação/execução por métrica e avisa quando a consulta
 * volta vazia (bloco renderizaria sem dado). Roda em paralelo (8 por vez).
 *
 * Uso:
 *   pnpm exec tsx --env-file=.env.local scripts/bq-validate-real-estate-metrics.ts [--dry-run] [--only=prefixo] [--end=2026-08-31] [--start=2025-09-01] [--dataset=imobiliaria_demo] [--project=<id>]
 */
import { BigQuery, type BigQueryOptions } from '@google-cloud/bigquery';
import { metrics } from './metrics/real-estate.mjs';
import { maxBytesBilled } from '../src/shared/lib/bigquery/cost-guard';

const argv = process.argv.slice(2);
const arg = (key: string) => argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const DRY = argv.includes('--dry-run');
const ONLY = arg('only');
const END = arg('end') ?? '2026-08-31';
const START = arg('start') ?? '2025-09-01';
const PROJECT_ID = arg('project') ?? process.env.BIGQUERY_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = arg('dataset') ?? 'imobiliaria_demo';
const LOCATION = process.env.BIGQUERY_LOCATION ?? 'US';
if (!PROJECT_ID) { console.error('Projeto ausente.'); process.exit(2); }

interface Metric { id: string; shape: string; outputColumns: string[]; recipe: { template: string } }

/** Mesma ordem do resolver: filtros → colunas → tabelas. */
export function resolveIdentity(template: string, p: { project: string; dataset: string; start: string; end: string }): string {
  // `ate` and `date_range` are filter keys written in the recipes: data, not identifiers.
  let sql = template.replace(/\{filter\.([a-z_][a-z0-9_]*)(?::([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*))?\}/g, (_m, key: string, _entity: string | undefined, attr: string | undefined) => {
    if (!attr) return '1=1';
    if (key === 'ate') return `\`${attr}\` <= '${p.end}'`;
    if (key === 'date_range') return `\`${attr}\` BETWEEN '${p.start}' AND '${p.end}'`;
    return '1=1';
  });
  sql = sql.replace(/\{([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\}/g, (_m, _entity: string, attr: string) => `\`${attr}\``);
  sql = sql.replace(/\{([a-z_][a-z0-9_]*)\}/g, (_m, entity: string) => `\`${p.project}.${p.dataset}.${entity}\``);
  return sql;
}

async function main(): Promise<void> {
  const opts: BigQueryOptions = { projectId: PROJECT_ID, location: LOCATION };
  if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  const bq = new BigQuery(opts);
  const selected = (metrics as Metric[]).filter((m) => !ONLY || m.id.startsWith(`imobiliaria.${ONLY}`));
  console.log(`${DRY ? 'DRY-RUN' : 'EXECUÇÃO'} de ${selected.length} métricas em ${PROJECT_ID}.${DATASET} (fim=${END})\n`);
  const errors: string[] = [];
  const empty: string[] = [];
  const wrongColumns: string[] = [];
  let ok = 0;
  const queue = [...selected];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const sql = resolveIdentity(m.recipe.template, { project: PROJECT_ID!, dataset: DATASET, start: START, end: END });
      try {
        if (DRY) {
          await bq.createQueryJob({ query: sql, dryRun: true, useLegacySql: false });
          ok++;
          continue;
        }
        const [rows] = await bq.query({ query: sql, useLegacySql: false, maximumBytesBilled: String(maxBytesBilled()) });
        ok++;
        if (rows.length === 0) empty.push(m.id);
        else {
          const keys = Object.keys(rows[0] as object);
          const missing = m.outputColumns.filter((c) => !keys.includes(c));
          if (missing.length) wrongColumns.push(`${m.id}: faltam ${missing.join(',')} (veio ${keys.join(',')})`);
          if (m.shape === 'scalar' && (rows[0] as Record<string, unknown>).value === null) empty.push(`${m.id} (value NULL)`);
        }
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
        errors.push(`${m.id}: ${msg}`);
        console.log(`  ✗ ${m.id}\n      ${msg}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`\n${ok} ok, ${errors.length} erro(s), ${empty.length} vazia(s), ${wrongColumns.length} com colunas divergentes`);
  for (const v of empty) console.log(`  ∅ ${v}`);
  for (const c of wrongColumns) console.log(`  ≠ ${c}`);
  if (errors.length || wrongColumns.length) process.exit(1);
}
main().catch((e) => { console.error('[bq-validate] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
