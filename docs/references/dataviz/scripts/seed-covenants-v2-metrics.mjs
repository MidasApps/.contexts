#!/usr/bin/env node

/**
 * Seed do catálogo `covenants.*` v2 (Vila Rosa, ~35+ métricas — Task 11).
 *
 * Molde: seed-galli-metrics.mjs, removido na purga (init firebase-admin, dry-run/apply,
 * shape do doc `metrics/{id}`). Definições em scripts/metrics/covenants-v2.mjs.
 *
 * Validação de shape MANUAL (sem Zod) — replicando as regras reais de
 * `src/shared/schemas/metric.ts`. Tentei importar `Metric` (Zod) direto do
 * módulo `.ts`; confirmado (de novo, como a Task 9 já havia achado) que
 * `tsx` não resolve named exports de um `.ts` a partir de um entrypoint
 * `.mjs` (`SyntaxError: ... does not provide an export named 'Metric'`,
 * reproduzido ao rodar `--dry-run`). Por isso este script segue o MESMO
 * padrão de `scripts/seed-liquid-play-plus-v2-contract.mjs` e
 * `scripts/seed-covenants-v2-relations.mjs`: validação manual replicando os
 * regexes/enums do Zod real (mantidos em sincronia por comentário de
 * referência em cada checagem).
 *
 * Idempotente: re-rodar não regrava quando o conteúdo já bate (createdAt
 * preservado). Guarda anti-sobrescrita (fix pós-review Task 11): se o id já
 * existe no Firestore com conteúdo DIFERENTE do que este script geraria
 * (label/description/type/unit/requires/recipe/ownerClientId), o doc é
 * DEIXADO INTACTO e o script loga "CONFLITO (conteúdo difere) — pulado" —
 * nunca sobrescreve silenciosamente uma métrica que pode ser de outro
 * cliente/pipeline (foi exatamente isso que quebrou `covenants.recebiveis_pre_pos`,
 * ver task-11-report.md § "Fix pós-review"). Use `--force` para sobrescrever
 * mesmo assim.
 *
 * Usage:
 *   node scripts/seed-covenants-v2-metrics.mjs --dry-run
 *   node scripts/seed-covenants-v2-metrics.mjs --apply [--allow-prod]
 *   node scripts/seed-covenants-v2-metrics.mjs --apply --force   # ignora conflitos
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metrics as COVENANTS_V2_METRICS } from './metrics/covenants-v2.mjs';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

// ───────────────────────────────────────────────────────────────────────
// Validação de shape manual — espelha src/shared/schemas/metric.ts
// ───────────────────────────────────────────────────────────────────────
const METRIC_ID_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/; // MetricId
const ATTRIBUTE_REF_RE = /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/; // AttributeRef (3-part)
const ENTITY_ATTR_RE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/; // EntityAttributeRef (2-part, recipe)
const CONTRACT_ENTITY_RE = /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*$/; // ContractEntityRef (derived.primaryEntity)
const ENTITY_RE = /^[a-z_][a-z0-9_]*$/; // EntityRef
const SLUG_RE = /^[a-z][a-z0-9_]*$/; // termo id derived
const METRIC_TYPES = ['kpi', 'chart', 'table'];
const AGGREGATIONS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'];
const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'];
const FILTER_OPS = ['=', '!=', '<', '<=', '>', '>=', 'in', 'not_in', 'between', 'is_null', 'is_not_null'];

function validateFilter(f, refRe, errors, prefix) {
  if (!refRe.test(f.attribute)) errors.push(`${prefix}.attribute inválido: ${f.attribute}`);
  if (!FILTER_OPS.includes(f.op)) errors.push(`${prefix}.op inválido: ${f.op}`);
}

function validateRecipe(recipe, errors) {
  if (!recipe || typeof recipe !== 'object') { errors.push('recipe ausente'); return; }
  if (recipe.kind === 'aggregation') {
    if (!ENTITY_RE.test(recipe.primaryEntity)) errors.push(`primaryEntity inválido: ${recipe.primaryEntity}`);
    if (!AGGREGATIONS.includes(recipe.aggregation)) errors.push(`aggregation inválida: ${recipe.aggregation}`);
    if (recipe.valueAttribute && !ENTITY_ATTR_RE.test(recipe.valueAttribute)) errors.push(`valueAttribute inválido: ${recipe.valueAttribute}`);
    if (!recipe.valueAttribute && !['count', 'count_distinct'].includes(recipe.aggregation)) errors.push('valueAttribute exigido para esta aggregation');
    if (recipe.timeAttribute && !ENTITY_ATTR_RE.test(recipe.timeAttribute)) errors.push(`timeAttribute inválido: ${recipe.timeAttribute}`);
    if (recipe.timeGrain && !TIME_GRAINS.includes(recipe.timeGrain)) errors.push(`timeGrain inválido: ${recipe.timeGrain}`);
    for (const g of recipe.groupByAttributes ?? []) if (!ENTITY_ATTR_RE.test(g)) errors.push(`groupByAttributes item inválido: ${g}`);
    for (const f of recipe.filters ?? []) validateFilter(f, ENTITY_ATTR_RE, errors, 'filters[]');
    return;
  }
  if (recipe.kind === 'sql') {
    if (typeof recipe.template !== 'string' || recipe.template.length < 1 || recipe.template.length > 10000) {
      errors.push('template inválido (vazio ou > 10000 chars)');
    }
    return;
  }
  if (recipe.kind === 'derived') {
    if (!CONTRACT_ENTITY_RE.test(recipe.primaryEntity)) errors.push(`primaryEntity (derived) inválido: ${recipe.primaryEntity}`);
    for (const j of recipe.joins ?? []) if (!j.relationId) errors.push('joins[] sem relationId');
    if (!Array.isArray(recipe.terms) || recipe.terms.length === 0) errors.push('terms vazio');
    for (const t of recipe.terms ?? []) {
      if (!SLUG_RE.test(t.id)) errors.push(`term.id inválido: ${t.id}`);
      if (!AGGREGATIONS.includes(t.aggregation)) errors.push(`term.aggregation inválida: ${t.aggregation}`);
      if (t.valueRef && !ATTRIBUTE_REF_RE.test(t.valueRef)) errors.push(`term.valueRef inválido: ${t.valueRef}`);
    }
    if (typeof recipe.expression !== 'string' || !recipe.expression) errors.push('expression ausente');
    if (recipe.timeRef && !ATTRIBUTE_REF_RE.test(recipe.timeRef)) errors.push(`timeRef inválido: ${recipe.timeRef}`);
    for (const g of recipe.groupByRefs ?? []) if (!ATTRIBUTE_REF_RE.test(g)) errors.push(`groupByRefs item inválido: ${g}`);
    for (const f of recipe.filters ?? []) validateFilter(f, ATTRIBUTE_REF_RE, errors, 'filters[]');
    return;
  }
  errors.push(`recipe.kind desconhecido: ${recipe.kind}`);
}

const PROJECT_ID = resolveGcpProject();
/**
 * O banco vem do MESMO env que o app usa (`DATAVIZ_DATABASE_ID`).
 * Sem o env, cai em `dataviz` — nunca em um banco de outro projeto.
 */
const DB_ID = resolveDatabaseId();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-covenants-v2-metrics' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

function validateShape(m) {
  const errors = [];
  if (!METRIC_ID_RE.test(m.id)) errors.push(`id inválido (esperado "domain.slug"): ${m.id}`);
  if (!m.label || typeof m.label !== 'string' || m.label.length < 1 || m.label.length > 120) errors.push('label ausente/inválido');
  if (m.description != null && (typeof m.description !== 'string' || m.description.length > 500)) errors.push('description inválida');
  if (m.type && !METRIC_TYPES.includes(m.type)) errors.push(`type inválido: ${m.type}`);
  if (m.unit != null && (typeof m.unit !== 'string' || m.unit.length > 20)) errors.push('unit inválida');
  if (!Array.isArray(m.requires) || m.requires.length === 0) errors.push('requires vazio');
  for (const r of m.requires ?? []) if (!ATTRIBUTE_REF_RE.test(r)) errors.push(`requires[] item inválido: ${r}`);
  if (m.ownerClientId != null && !/^[a-z][a-z0-9-]*$/.test(m.ownerClientId)) errors.push(`ownerClientId inválido: ${m.ownerClientId}`);
  validateRecipe(m.recipe, errors);
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Campos "de conteúdo" — o que decide se dois docs são a MESMA métrica. */
function normalizeForCompare(data) {
  return {
    label: data.label,
    description: data.description ?? null,
    type: data.type ?? 'kpi',
    category: data.category ?? null,
    unit: data.unit ?? null,
    requires: data.requires,
    recipe: data.recipe,
    version: data.version ?? '1.0.0',
    status: data.status ?? 'active',
    ownerClientId: data.ownerClientId ?? null,
  };
}

async function seedMetric(metric) {
  const shape = validateShape(metric);
  if (!shape.ok) {
    console.log(`  ✗ metrics/${metric.id}  INVÁLIDO:`);
    for (const e of shape.errors) console.log(`      - ${e}`);
    return { ok: false, id: metric.id };
  }

  const ref = db.collection('metrics').doc(metric.id);
  const existing = await ref.get();
  const now = Timestamp.now();

  const payload = {
    label: metric.label,
    description: metric.description ?? null,
    type: metric.type ?? 'kpi',
    category: null,
    unit: metric.unit ?? null,
    requires: metric.requires,
    recipe: metric.recipe,
    version: '1.0.0',
    status: 'active',
    ownerClientId: metric.ownerClientId ?? null,
    updatedAt: now,
  };

  if (!existing.exists) {
    payload.createdAt = now;
    console.log(`  + metrics/${metric.id}  (${payload.type}, ${metric.recipe.kind}, requires=${metric.requires.length})`);
    if (APPLY) await ref.set(payload, { merge: false });
    return { ok: true, id: metric.id, action: 'create' };
  }

  // Doc já existe — compara conteúdo antes de decidir se escreve.
  const existingData = existing.data();
  const sameContent = JSON.stringify(normalizeForCompare(existingData)) === JSON.stringify(normalizeForCompare(payload));

  if (sameContent) {
    console.log(`  ~ metrics/${metric.id}  (sem mudança de conteúdo — no-op, createdAt preservado)`);
    return { ok: true, id: metric.id, action: 'noop' };
  }

  if (!FORCE) {
    console.log(`  ! metrics/${metric.id}  CONFLITO (conteúdo difere do Firestore) — pulado, NADA gravado (use --force para sobrescrever)`);
    return { ok: true, id: metric.id, action: 'conflict' };
  }

  // --force: sobrescreve, mas preserva createdAt original (merge:false apagaria o campo senão).
  payload.createdAt = existingData.createdAt ?? now;
  console.log(`  ⚠ metrics/${metric.id}  CONFLITO (conteúdo difere) — FORÇANDO sobrescrita (--force)`);
  if (APPLY) await ref.set(payload, { merge: false });
  return { ok: true, id: metric.id, action: 'forced' };
}

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`${mode} — seed catálogo covenants.* v2 (Vila Rosa)`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}`);
  console.log(`\nMétricas (${COVENANTS_V2_METRICS.length}):`);

  const results = [];
  for (const m of COVENANTS_V2_METRICS) results.push(await seedMetric(m));

  const invalid = results.filter((r) => !r.ok);
  const created = results.filter((r) => r.action === 'create').length;
  const noop = results.filter((r) => r.action === 'noop').length;
  const conflict = results.filter((r) => r.action === 'conflict').length;
  const forced = results.filter((r) => r.action === 'forced').length;

  console.log(`\nTotal: ${COVENANTS_V2_METRICS.length} métricas (${results.length - invalid.length} válidas, ${invalid.length} inválidas)`);
  console.log(`  criar=${created}  sem-mudança=${noop}  CONFLITO=${conflict}  forçado=${forced}`);
  if (conflict > 0) {
    console.log(`\nCONCERN — ${conflict} id(s) já existem no Firestore com conteúdo diferente e NÃO foram sobrescritos:`);
    for (const r of results) if (r.action === 'conflict') console.log(`  - ${r.id}`);
  }
  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)');
  else console.log('\nConcluído.');

  if (invalid.length) process.exit(1);
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
