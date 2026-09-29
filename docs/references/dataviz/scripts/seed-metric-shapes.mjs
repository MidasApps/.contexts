#!/usr/bin/env node

/**
 * Backfill de `shape` + `outputColumns` nos documentos `metrics/{id}`.
 *
 * Por que existe: `MetricDoc` ganhou os dois campos (ver JSDoc em
 * src/shared/schemas/metric.ts), mas os 64 documentos já em produção foram
 * gravados antes deles. Sem backfill, `client-semantic-context` continua
 * entregando à IA um catálogo em que um escalar e uma série pivotada de 8
 * colunas são indistinguíveis.
 *
 * Este script NÃO cria métrica, NÃO altera recipe/label/requires e NÃO apaga
 * nada: faz `set({ shape, outputColumns }, { merge: true })` no doc que já
 * existe. Métrica ausente do Firestore é reportada e pulada — criar é trabalho
 * de `scripts/seed-covenants-v2-metrics.mjs`.
 *
 * Fonte da classificação: scripts/metrics/covenants-v2.mjs (campos `shape` e
 * `outputColumns` de cada métrica, derivados do template SQL — ver nota 7 do
 * cabeçalho de lá).
 *
 * Idempotente: quando o doc já tem exatamente os mesmos valores, não grava
 * (no-op). Quando tem valores DIFERENTES, só sobrescreve com `--force` — do
 * contrário reporta CONFLITO e deixa intacto, mesma política de
 * seed-covenants-v2-metrics.mjs (um id de `metrics/` pode ser global e
 * compartilhado com outros clientes).
 *
 * Banco: o app NÃO usa o database default. Lê `DATAVIZ_DATABASE_ID` do
 * ambiente (o mesmo que `src/shared/lib/runtime-config.ts` lê) e cai em
 * `dataviz-dev` quando ausente; `--db=<id>` sobrepõe os dois. O banco
 * efetivo é impresso antes de qualquer operação — confira antes de aplicar.
 *
 * Usage (dry-run é o DEFAULT — sem `--apply` nada é gravado):
 *   node --env-file-if-exists=.env.local scripts/seed-metric-shapes.mjs
 *   node --env-file-if-exists=.env.local scripts/seed-metric-shapes.mjs --apply [--allow-prod]
 *   node scripts/seed-metric-shapes.mjs --db=dataviz-dev --apply --force
 *
 * No banco `dataviz` (produção) `--apply` exige `--allow-prod`; `--dry-run`
 * junto com `--apply` é recusado.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metrics as COVENANTS_V2_METRICS } from './metrics/covenants-v2.mjs';
import { resolveGcpProject, DEFAULT_DEV_DATABASE_ID } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();
const DEFAULT_DB_ID = DEFAULT_DEV_DATABASE_ID;

/** Espelha `METRIC_SHAPES` de src/shared/schemas/metric.ts. */
const SHAPES = ['scalar', 'timeseries', 'timeseries_multi', 'timeseries_pivot', 'breakdown', 'rows'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const DRY_RUN = !APPLY; // dry-run é o default: só `--apply` grava.

const dbFlag = args.find((a) => a.startsWith('--db='))?.slice('--db='.length);
const DB_ID = dbFlag || process.env.DATAVIZ_DATABASE_ID || DEFAULT_DB_ID;
const DB_SOURCE = dbFlag ? '--db' : process.env.DATAVIZ_DATABASE_ID ? 'env DATAVIZ_DATABASE_ID' : 'default do script';

const unknown = args.filter((a) => !['--apply', '--force', '--dry-run', '--allow-prod'].includes(a) && !a.startsWith('--db='));
if (unknown.length > 0) {
  console.error(`Flag desconhecida: ${unknown.join(', ')}`);
  console.error('Use: [--db=<id>] [--apply] [--force] [--allow-prod]  (sem --apply = dry-run)');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-metric-shapes' });

/** Valida a classificação ANTES de tocar o Firestore — falha rápido e completa. */
function validate(metric) {
  const errors = [];
  if (!SHAPES.includes(metric.shape)) errors.push(`shape inválido: ${JSON.stringify(metric.shape)}`);
  if (!Array.isArray(metric.outputColumns) || metric.outputColumns.length === 0) {
    errors.push('outputColumns ausente ou vazio');
  } else {
    for (const c of metric.outputColumns) {
      if (typeof c !== 'string' || c.length === 0 || c.length > 80) errors.push(`coluna inválida: ${JSON.stringify(c)}`);
    }
    if (new Set(metric.outputColumns).size !== metric.outputColumns.length) errors.push('outputColumns tem nome repetido');
  }
  return errors;
}

function sameContent(existing, payload) {
  return (
    existing.shape === payload.shape
    && Array.isArray(existing.outputColumns)
    && existing.outputColumns.length === payload.outputColumns.length
    && existing.outputColumns.every((c, i) => c === payload.outputColumns[i])
  );
}

async function backfill(db, metric) {
  const payload = { shape: metric.shape, outputColumns: metric.outputColumns };
  const ref = db.collection('metrics').doc(metric.id);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`  ? metrics/${metric.id}  AUSENTE no Firestore — pulado (este script não cria métrica)`);
    return { id: metric.id, action: 'missing' };
  }

  const existing = snap.data() ?? {};
  const alreadyHad = existing.shape !== undefined || existing.outputColumns !== undefined;

  if (alreadyHad && sameContent(existing, payload)) {
    console.log(`  ~ metrics/${metric.id}  já com ${payload.shape} — no-op`);
    return { id: metric.id, action: 'noop' };
  }

  if (alreadyHad && !FORCE) {
    console.log(
      `  ! metrics/${metric.id}  CONFLITO — no Firestore: ${JSON.stringify({ shape: existing.shape, outputColumns: existing.outputColumns })}`
      + `\n      seria: ${JSON.stringify(payload)}  → NADA gravado (use --force)`,
    );
    return { id: metric.id, action: 'conflict' };
  }

  const verb = alreadyHad ? 'SOBRESCREVER (--force)' : 'gravar';
  console.log(`  + metrics/${metric.id}  ${verb}: shape=${payload.shape}  colunas=[${payload.outputColumns.join(', ')}]`);
  // merge:true — só encosta nos dois campos (+ updatedAt); recipe/label/
  // requires/createdAt/ownerClientId ficam exatamente como estão. `updatedAt`
  // só se move quando houve mudança real: o no-op acima já retornou.
  if (APPLY) await ref.set({ ...payload, updatedAt: Timestamp.now() }, { merge: true });
  return { id: metric.id, action: alreadyHad ? 'forced' : 'write' };
}

async function main() {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — backfill de shape/outputColumns em metrics/`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`DB:      ${DB_ID}   (origem: ${DB_SOURCE})`);
  console.log(`Métricas na fonte: ${COVENANTS_V2_METRICS.length}\n`);

  const invalid = [];
  for (const m of COVENANTS_V2_METRICS) {
    const errors = validate(m);
    if (errors.length > 0) invalid.push({ id: m.id, errors });
  }
  if (invalid.length > 0) {
    console.error('Classificação inválida — nada foi lido nem gravado:');
    for (const { id, errors } of invalid) console.error(`  ✗ ${id}: ${errors.join('; ')}`);
    process.exit(1);
  }

  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(DB_ID);

  const results = [];
  for (const m of COVENANTS_V2_METRICS) results.push(await backfill(db, m));

  const count = (a) => results.filter((r) => r.action === a).length;
  console.log(
    `\nResumo: gravar=${count('write')}  no-op=${count('noop')}  CONFLITO=${count('conflict')}`
    + `  forçado=${count('forced')}  ausente=${count('missing')}`,
  );

  const conflicts = results.filter((r) => r.action === 'conflict');
  if (conflicts.length > 0) {
    console.log(`\nCONCERN — ${conflicts.length} doc(s) já têm shape/outputColumns diferentes e NÃO foram tocados:`);
    for (const r of conflicts) console.log(`  - ${r.id}`);
  }
  const missing = results.filter((r) => r.action === 'missing');
  if (missing.length > 0) {
    console.log(`\nCONCERN — ${missing.length} métrica(s) não existem em ${DB_ID}:`);
    for (const r of missing) console.log(`  - ${r.id}`);
  }

  console.log(DRY_RUN ? '\n(dry-run — nada foi gravado. Repita com --apply.)' : '\nConcluído.');
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
