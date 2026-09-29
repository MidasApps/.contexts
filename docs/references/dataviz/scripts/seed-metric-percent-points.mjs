#!/usr/bin/env node

/**
 * Backfill de `percentPointColumns` nos documentos `metrics/{id}` (ADR-0032).
 *
 * A escala do percentual (fração 0–1 ou pontos 0–100) passou a ser metadado da
 * métrica: KPI e tabela com `format: 'percent'` só multiplicam por 100 as
 * colunas que NÃO estão declaradas em pontos. Os documentos já gravados não
 * têm o campo — sem backfill, o KPI de atingimento montado pelo assistente
 * segue exibindo "8.227,22%".
 *
 * Fonte: os dois catálogos versionados — `scripts/metrics/real-estate.mjs`
 * (o helper `sql({ scale })` declara as colunas) e
 * `scripts/metrics/covenants-v2.mjs` (as métricas de obra, que vêm em pontos
 * no próprio dado). Só as métricas que declaram o campo são tocadas.
 *
 * Só faz `set({ percentPointColumns }, { merge: true })` em doc que já existe:
 * não cria métrica, não altera recipe/label/requires, não apaga nada.
 * Idempotente: valor igual ⇒ no-op. Valor DIFERENTE só é sobrescrito com
 * `--force`; sem ele, CONFLITO é reportado e o doc fica intacto.
 *
 * Usage (dry-run é o DEFAULT — sem `--apply` nada é gravado):
 *   node --env-file-if-exists=.env.local scripts/seed-metric-percent-points.mjs [--db=<id>]
 *   node --env-file-if-exists=.env.local scripts/seed-metric-percent-points.mjs --db=<id> --apply [--force] [--allow-prod]
 *
 * Banco: `--db=<id>` > `DATAVIZ_DATABASE_ID` > `dataviz-dev`. No banco
 * `dataviz` `--apply` exige `--allow-prod`.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metrics as REAL_ESTATE_METRICS } from './metrics/real-estate.mjs';
import { metrics as COVENANTS_V2_METRICS } from './metrics/covenants-v2.mjs';
import { resolveGcpProject, DEFAULT_DEV_DATABASE_ID } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const dbFlag = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);
const DB_ID = dbFlag || process.env.DATAVIZ_DATABASE_ID || DEFAULT_DEV_DATABASE_ID;

const unknown = args.filter((a) => !['--apply', '--force', '--dry-run', '--allow-prod'].includes(a) && !a.startsWith('--db='));
if (unknown.length > 0) {
  console.error(`Flag desconhecida: ${unknown.join(', ')}`);
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-metric-percent-points' });

const declared = [...REAL_ESTATE_METRICS, ...COVENANTS_V2_METRICS].filter((m) => m.percentPointColumns?.length);

/** Coluna em pontos que a métrica não devolve é erro de catálogo: falha antes de ler o Firestore. */
const invalid = declared.filter((m) => m.percentPointColumns.some((c) => !m.outputColumns.includes(c)));
if (invalid.length > 0) {
  for (const m of invalid) console.error(`  ✗ ${m.id}: percentPointColumns fora de outputColumns`);
  process.exit(1);
}

const sameColumns = (a, b) => Array.isArray(a) && a.length === b.length && a.every((c, i) => c === b[i]);

async function backfill(db, metric) {
  const ref = db.collection('metrics').doc(metric.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ? metrics/${metric.id}  AUSENTE — pulado`);
    return 'missing';
  }
  const existing = snap.data()?.percentPointColumns;
  if (sameColumns(existing, metric.percentPointColumns)) return 'noop';
  if (existing !== undefined && !FORCE) {
    console.log(`  ! metrics/${metric.id}  CONFLITO — no Firestore: ${JSON.stringify(existing)}; seria ${JSON.stringify(metric.percentPointColumns)} (use --force)`);
    return 'conflict';
  }
  console.log(`  + metrics/${metric.id}  ${existing === undefined ? 'gravar' : 'SOBRESCREVER (--force)'}: [${metric.percentPointColumns.join(', ')}]`);
  if (APPLY) await ref.set({ percentPointColumns: metric.percentPointColumns, updatedAt: Timestamp.now() }, { merge: true });
  return existing === undefined ? 'write' : 'forced';
}

async function main() {
  const projectId = resolveGcpProject();
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — backfill de percentPointColumns em metrics/  DB: ${DB_ID}`);
  console.log(`Métricas com colunas em pontos na fonte: ${declared.length}\n`);
  if (getApps().length === 0) initializeApp({ projectId });
  const db = getFirestore(DB_ID);

  const results = [];
  for (const m of declared) results.push(await backfill(db, m));
  const count = (a) => results.filter((r) => r === a).length;
  console.log(`\nResumo: gravar=${count('write')}  no-op=${count('noop')}  CONFLITO=${count('conflict')}  forçado=${count('forced')}  ausente=${count('missing')}`);
  console.log(APPLY ? 'Concluído.' : '(dry-run — nada foi gravado. Repita com --apply.)');
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
