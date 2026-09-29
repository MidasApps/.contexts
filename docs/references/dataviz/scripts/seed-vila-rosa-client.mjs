#!/usr/bin/env node

/**
 * Cria o cliente `vila-rosa` com bindings para os datasets BigQuery
 * `vila_rosa_monitor` (contratos, fluxo_caixa, pagamentos) e
 * `vila_rosa_covenants` (7 entidades) + faz merge das 64 métricas
 * `covenants.*` v2 (Task 11) em `products/liquid-play-plus.metricRefs`.
 *
 * Molde: `seed-liquid-play-contracts.mjs:263-268,419-459` (removido na purga)
 * (`seedGalliClient` — mesma estrutura de `productBindings`, mesmo helper
 * `buildIdentitySchemaBindings`). Schemas transcritos de
 * `docs/bases/vila-rosa/BigQuery/*.json` (introspecção BigQuery); `pagamentos`
 * não tem JSON — colunas confirmadas via
 * `bq-data-wh.vila_rosa_monitor.INFORMATION_SCHEMA.COLUMNS` (13 cols, SA
 * chave da service account).
 *
 * ── Divergência do brief documentada (task-12-report.md) ──
 * O pseudocódigo do brief (task-12-brief.md:14-21) usava
 * `productId: 'credit'`/`'covenants'` e `contractRef: 'canonical'`. Os IDs
 * `credit`/`covenants` EXISTEM no Firestore `products/`, mas são um produto
 * LEGADO (contrato `canonical`) de domínio de covenants de EMISSÃO/DÍVIDA
 * (bonds — `covenants.total_emissoes`, `covenants.breaches_ativos`, etc.),
 * usado por 8 clientes pré-existentes (om/brz/conx/imcasa/spl/vivamus/
 * vila-brasil/jotanunes) — sem nenhuma relação com o domínio imobiliário do
 * Vila Rosa. Nenhum cliente usa `productId: 'covenants'` hoje.
 *
 * Usar `contractRef: 'canonical'` quebraria a execução: as 64 métricas da
 * Task 11 têm `requires` com prefixo `liquid-play-plus.*` (confirmado em
 * `scripts/metrics/covenants-v2.mjs` e nos docs `metrics/covenants.*` já
 * gravados) — `executeMetric` (src/shared/lib/metrics/execute-metric.ts:210)
 * resolve o dataset do cliente por `contractRef` IGUAL ao prefixo de
 * `requires[0]`, não por `productId`. Sem um dataset com
 * `contractRef: 'liquid-play-plus'` no binding, TODA métrica desta task
 * falharia com 422 ("cliente não cobre o contrato").
 *
 * O único outro cliente do MESMO contrato novo (`liquid-play`/
 * `liquid-play-plus`) é o Galli, que usa `productId: 'liquid-play'` /
 * `'liquid-play-plus'` com `contractRef` idêntico ao productId — exatamente
 * o "molde vivo" que o controller pediu para espelhar. Replicado aqui.
 *
 * Consequência para o Step 2 (merge de metricRefs): o produto real que o
 * binding de covenants referencia é `products/liquid-play-plus`
 * (`metricRefs: []` hoje), não `products/covenants` (produto não
 * relacionado, já com 18 ids de outro domínio — adicionar lá poluiria o
 * contexto semântico de IA dos 8 clientes legados). Faço merge em
 * `products/liquid-play-plus.metricRefs`.
 *
 * Idempotente: re-rodar não duplica nem sobrescreve sem --force se o doc já
 * existir com conteúdo DIFERENTE do que este script geraria.
 *
 * `--apply` no banco de produção (`dataviz`) é recusado sem `--allow-prod`,
 * e `--dry-run` junto com `--apply` é recusado sempre (`lib/production-guard.mjs`).
 *
 * Usage:
 *   pnpm tsx scripts/seed-vila-rosa-client.mjs --dry-run
 *   pnpm tsx scripts/seed-vila-rosa-client.mjs --apply [--allow-prod]
 *   pnpm tsx scripts/seed-vila-rosa-client.mjs --apply --force   (sobrescreve conflito)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metrics as covenantsV2Metrics } from './metrics/covenants-v2.mjs';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { MONITOR_SCHEMA, COVENANTS_SCHEMA } from './lib/vila-rosa-schemas.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-vila-rosa-client' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

// ─────────────────────────────────────────────────────────────────────
// Cliente
// ─────────────────────────────────────────────────────────────────────
const CLIENT_ID = 'vila-rosa';
const CLIENT_BASE = { name: 'Vila Rosa', initial: 'V', color: '#E85D2C' };

// Produto real que o Galli usa (ver nota de divergência no cabeçalho).
const METRICREFS_TARGET_PRODUCT = 'liquid-play-plus';
const NEW_METRIC_IDS = covenantsV2Metrics.map((m) => m.id);

function buildIdentitySchemaBindings(schemaMap) {
  const bindings = {};
  for (const [entityId, cols] of Object.entries(schemaMap)) {
    for (const [col] of cols) bindings[`${entityId}.${col}`] = col;
  }
  return bindings;
}

function buildIdentityTableBindings(schemaMap) {
  const tb = {};
  for (const entityId of Object.keys(schemaMap)) tb[entityId] = entityId;
  return tb;
}

// dataSources/<id> must be the GCP project id: the front builds "<dataSourceId>.<dataset>".
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID || PROJECT_ID;

function buildProductBindings() {
  return [
    {
      productId: 'liquid-play',
      datasets: [{
        id: 'main',
        dataSourceId: DATA_SOURCE_ID,
        datasetId: 'vila_rosa_monitor',
        contractRef: 'liquid-play',
        schemaBindings: buildIdentitySchemaBindings(MONITOR_SCHEMA),
        schema: {},
        tableBindings: buildIdentityTableBindings(MONITOR_SCHEMA),
        isPrimary: true,
      }],
      enabledIndicators: null,
    },
    {
      productId: 'liquid-play-plus',
      datasets: [{
        id: 'main',
        dataSourceId: DATA_SOURCE_ID,
        datasetId: 'vila_rosa_covenants',
        contractRef: 'liquid-play-plus',
        schemaBindings: buildIdentitySchemaBindings(COVENANTS_SCHEMA),
        schema: {},
        tableBindings: buildIdentityTableBindings(COVENANTS_SCHEMA),
        isPrimary: true,
      }],
      enabledIndicators: null,
    },
  ];
}

/** Stringify determinístico (chaves ordenadas) — usado para comparar docs ignorando timestamps. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function seedClient() {
  console.log(`\n=== Cliente: ${CLIENT_ID} ===`);
  const ref = db.collection('clients').doc(CLIENT_ID);
  const existing = await ref.get();
  const now = Timestamp.now();

  const desiredProductBindings = buildProductBindings();
  const desired = { ...CLIENT_BASE, productBindings: desiredProductBindings };

  if (existing.exists) {
    const data = existing.data();
    const existingComparable = {
      name: data.name, initial: data.initial, color: data.color,
      productBindings: data.productBindings ?? [],
    };
    const same = stableStringify(existingComparable) === stableStringify(desired);
    if (same) {
      console.log(`  = clients/${CLIENT_ID}  (já existe, conteúdo idêntico — no-op)`);
      return;
    }
    if (!FORCE) {
      console.log(`  ! clients/${CLIENT_ID}  CONFLITO (conteúdo difere do Firestore) — pulado, NADA gravado.`);
      console.log('    Rode com --force para sobrescrever (revise a diferença antes).');
      return;
    }
    console.log(`  ~ clients/${CLIENT_ID}  (existe, diverge — FORÇANDO sobrescrita, createdAt preservado)`);
    const payload = { ...desired, updatedAt: now };
    if (APPLY) await ref.set(payload, { merge: false });
    return;
  }

  console.log(`  + clients/${CLIENT_ID}  (criar)`);
  console.log(`    productBindings: liquid-play(vila_rosa_monitor, ${Object.keys(MONITOR_SCHEMA).join('+')}), ` +
    `liquid-play-plus(vila_rosa_covenants, ${Object.keys(COVENANTS_SCHEMA).length} entidades)`);
  for (const [entityId, cols] of Object.entries(MONITOR_SCHEMA)) {
    console.log(`      monitor.${entityId}: ${cols.length} colunas`);
  }
  for (const [entityId, cols] of Object.entries(COVENANTS_SCHEMA)) {
    console.log(`      covenants.${entityId}: ${cols.length} colunas`);
  }
  const payload = { ...desired, createdAt: now, updatedAt: now };
  if (APPLY) await ref.set(payload);
}

async function mergeProductMetricRefs() {
  console.log(`\n=== Merge metricRefs: products/${METRICREFS_TARGET_PRODUCT} ===`);
  const ref = db.collection('products').doc(METRICREFS_TARGET_PRODUCT);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ! products/${METRICREFS_TARGET_PRODUCT} não existe — abortando merge.`);
    return;
  }
  const data = snap.data();
  const existingRefs = Array.isArray(data.metricRefs) ? data.metricRefs : [];
  const merged = Array.from(new Set([...existingRefs, ...NEW_METRIC_IDS]));
  const added = NEW_METRIC_IDS.filter((id) => !existingRefs.includes(id));

  console.log(`  metricRefs antes: ${existingRefs.length}`);
  console.log(`  metricRefs depois: ${merged.length}`);
  console.log(`  novos adicionados: ${added.length}`);
  if (added.length > 0) console.log(`    ${added.join(', ')}`);
  if (added.length === 0) {
    console.log('  = nenhuma métrica nova a adicionar (já presentes — no-op)');
    return;
  }

  if (APPLY) {
    await ref.set({ metricRefs: merged, updatedAt: Timestamp.now() }, { merge: true });
  }
}

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`${mode} — seed cliente vila-rosa + merge metricRefs`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}`);
  console.log(`Métricas Task 11 carregadas de scripts/metrics/covenants-v2.mjs: ${NEW_METRIC_IDS.length}`);

  await seedClient();
  await mergeProductMetricRefs();

  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)');
  else console.log('\nConcluído.');
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
