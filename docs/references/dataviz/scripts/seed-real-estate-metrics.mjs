#!/usr/bin/env node
/**
 * Seed do catálogo `imobiliaria.*` (268 métricas) em `metrics/{id}`.
 *
 * Molde: `seed-covenants-v2-metrics.mjs` — validação de shape manual que
 * espelha `src/shared/schemas/metric.ts`, idempotência (no-op quando idêntico)
 * e guarda de conflito (doc com conteúdo diferente é pulado sem --force).
 *
 * Antes de rodar: `pnpm exec tsx --env-file=.env.local scripts/bq-validate-real-estate-metrics.ts`
 * garante que toda receita compila e executa no BigQuery.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-real-estate-metrics.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-real-estate-metrics.mjs --apply [--force]
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metrics } from './metrics/real-estate.mjs';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const METRIC_ID_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const ATTRIBUTE_REF_RE = /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const METRIC_TYPES = ['kpi', 'chart', 'table'];
const SHAPES = ['scalar', 'timeseries', 'timeseries_multi', 'timeseries_pivot', 'breakdown', 'rows', 'targets', 'points', 'matrix', 'funnel', 'flow', 'distribution'];

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
if (!DRY_RUN && !APPLY) { console.error('Especifique --dry-run ou --apply'); process.exit(2); }
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-real-estate-metrics' });
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

function validateShape(m) {
  const errors = [];
  if (!METRIC_ID_RE.test(m.id)) errors.push(`id inválido: ${m.id}`);
  if (!m.label || m.label.length > 120) errors.push('label ausente/inválido');
  if (m.description != null && m.description.length > 500) errors.push('description > 500');
  if (!METRIC_TYPES.includes(m.type)) errors.push(`type inválido: ${m.type}`);
  if (m.unit != null && m.unit.length > 20) errors.push('unit inválida');
  if (m.category != null && m.category.length > 40) errors.push('category > 40');
  if (!Array.isArray(m.requires) || !m.requires.length) errors.push('requires vazio');
  for (const r of m.requires ?? []) if (!ATTRIBUTE_REF_RE.test(r)) errors.push(`requires inválido: ${r}`);
  if (!SHAPES.includes(m.shape)) errors.push(`shape inválido: ${m.shape}`);
  if (!Array.isArray(m.outputColumns) || !m.outputColumns.length || m.outputColumns.length > 64) errors.push('outputColumns inválido');
  if (m.recipe?.kind !== 'sql' || typeof m.recipe.template !== 'string' || m.recipe.template.length < 1 || m.recipe.template.length > 10000) errors.push('recipe sql inválida');
  return errors;
}
function normalizeForCompare(d) {
  return { label: d.label, description: d.description ?? null, type: d.type ?? 'kpi', category: d.category ?? null, unit: d.unit ?? null, requires: d.requires, recipe: d.recipe, shape: d.shape ?? null, outputColumns: d.outputColumns ?? null, percentPointColumns: d.percentPointColumns ?? null, version: d.version ?? '1.0.0', status: d.status ?? 'active', ownerClientId: d.ownerClientId ?? null };
}
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function main() {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — ${metrics.length} métricas imobiliaria.* → metrics/  (project=${PROJECT_ID} db=${DB_ID})\n`);
  const invalid = metrics.map((m) => [m.id, validateShape(m)]).filter(([, e]) => e.length);
  if (invalid.length) { for (const [id, e] of invalid) console.log(`  ✗ ${id}: ${e.join('; ')}`); process.exit(1); }
  const counts = { create: 0, same: 0, conflict: 0, forced: 0 };
  const now = Timestamp.now();
  let batch = db.batch();
  let pending = 0;
  const flush = async () => { if (APPLY && pending) { await batch.commit(); batch = db.batch(); pending = 0; } };
  for (const m of metrics) {
    const ref = db.collection('metrics').doc(m.id);
    const snap = await ref.get();
    const desired = { label: m.label, description: m.description ?? null, type: m.type, category: m.category ?? null, unit: m.unit ?? null, requires: m.requires, recipe: m.recipe, shape: m.shape, outputColumns: m.outputColumns, ...(m.percentPointColumns ? { percentPointColumns: m.percentPointColumns } : {}), version: '1.0.0', status: 'active', ownerClientId: null };
    if (snap.exists) {
      const same = stableStringify(normalizeForCompare(snap.data())) === stableStringify(normalizeForCompare(desired));
      if (same) { counts.same++; continue; }
      if (!FORCE) { counts.conflict++; console.log(`  ! ${m.id}  CONFLITO — pulado (use --force)`); continue; }
      counts.forced++;
      if (APPLY) { batch.set(ref, { ...desired, createdAt: snap.data().createdAt ?? now, updatedAt: now }); pending++; }
    } else {
      counts.create++;
      if (APPLY) { batch.set(ref, { ...desired, createdAt: now, updatedAt: now }); pending++; }
    }
    if (pending >= 400) await flush();
  }
  await flush();
  console.log(`\n${counts.create} a criar, ${counts.same} idênticas, ${counts.conflict} conflito(s), ${counts.forced} sobrescrita(s) forçada(s).`);
  if (APPLY) {
    const snap = await db.collection('metrics').orderBy('__name__').startAt('imobiliaria.').endAt('imobiliaria.\uf8ff').get();
    console.log(`Verificação: ${snap.size} docs metrics/imobiliaria.* no Firestore.`);
  }
}
main().catch((e) => { console.error('[seed-real-estate-metrics] FAILED:', e.message ?? e); process.exit(1); });
