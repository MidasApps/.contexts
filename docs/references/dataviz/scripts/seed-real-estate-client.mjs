#!/usr/bin/env node
/**
 * Cria o cliente demo `imob-demo` com binding para o dataset BigQuery
 * `imobiliaria_demo` (20 entidades do contrato `imobiliaria`) e faz merge
 * das métricas `imobiliaria.*` em `products/imobiliaria.metricRefs`.
 *
 * Molde: `seed-vila-rosa-client.mjs`. A regra que importa (ver cabeçalho de
 * lá): `executeMetric` resolve o dataset do cliente por `contractRef` IGUAL
 * ao prefixo de `requires[0]` de cada métrica — aqui `imobiliaria`.
 *
 * Idempotente: no-op se idêntico; conflito é pulado sem --force.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-real-estate-client.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-real-estate-client.mjs --apply [--force]
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { REAL_ESTATE_SCHEMA } from './lib/real-estate-schemas.mjs';
import { metrics } from './metrics/real-estate.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-real-estate-client' });
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

export const CLIENT_ID = 'imob-demo';
const CLIENT_BASE = { name: 'Imobiliária Demo', initial: 'I', color: '#0EA5E9' };
const PRODUCT_ID = 'imobiliaria';
const CONTRACT_ID = 'imobiliaria';
const DATASET_ID = 'imobiliaria_demo';
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID || PROJECT_ID;

function buildIdentitySchemaBindings(schemaMap) {
  const bindings = {};
  for (const [entityId, cols] of Object.entries(schemaMap)) for (const [col] of cols) bindings[`${entityId}.${col}`] = col;
  return bindings;
}
function buildIdentityTableBindings(schemaMap) {
  return Object.fromEntries(Object.keys(schemaMap).map((e) => [e, e]));
}
function buildProductBindings() {
  return [{
    productId: PRODUCT_ID,
    datasets: [{
      id: 'main', dataSourceId: DATA_SOURCE_ID, datasetId: DATASET_ID, contractRef: CONTRACT_ID,
      schemaBindings: buildIdentitySchemaBindings(REAL_ESTATE_SCHEMA), schema: {},
      tableBindings: buildIdentityTableBindings(REAL_ESTATE_SCHEMA), isPrimary: true,
    }],
    enabledIndicators: null,
  }];
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function seedClient() {
  console.log(`\n=== Cliente: ${CLIENT_ID} ===`);
  const ref = db.collection('clients').doc(CLIENT_ID);
  const existing = await ref.get();
  const now = Timestamp.now();
  const desired = { ...CLIENT_BASE, productBindings: buildProductBindings() };
  if (existing.exists) {
    const data = existing.data();
    const comparable = { name: data.name, initial: data.initial, color: data.color, productBindings: data.productBindings ?? [] };
    if (stableStringify(comparable) === stableStringify(desired)) { console.log(`  = clients/${CLIENT_ID}  (idêntico — no-op)`); return; }
    if (!FORCE) { console.log(`  ! clients/${CLIENT_ID}  CONFLITO (conteúdo difere) — pulado. Use --force.`); return; }
    console.log(`  ~ clients/${CLIENT_ID}  (diverge — FORÇANDO sobrescrita)`);
    if (APPLY) await ref.set({ ...desired, createdAt: data.createdAt ?? now, updatedAt: now }, { merge: false });
    return;
  }
  console.log(`  + clients/${CLIENT_ID}  (criar) — binding ${PRODUCT_ID} → ${DATA_SOURCE_ID}.${DATASET_ID}, contractRef=${CONTRACT_ID}, ${Object.keys(REAL_ESTATE_SCHEMA).length} entidades`);
  if (APPLY) await ref.set({ ...desired, createdAt: now, updatedAt: now });
}

async function mergeProductMetricRefs() {
  console.log(`\n=== Merge metricRefs: products/${PRODUCT_ID} ===`);
  const ref = db.collection('products').doc(PRODUCT_ID);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  ✗ products/${PRODUCT_ID} não existe — rode seed-real-estate-contract.mjs antes.`); return; }
  const current = snap.data().metricRefs ?? [];
  const ids = metrics.map((m) => m.id);
  const added = ids.filter((id) => !current.includes(id));
  if (!added.length) { console.log(`  = metricRefs já contém as ${ids.length} métricas — no-op`); return; }
  console.log(`  ~ metricRefs: +${added.length} (total ${current.length + added.length})`);
  if (APPLY) await ref.update({ metricRefs: [...current, ...added], updatedAt: Timestamp.now() });
}

async function main() {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — cliente ${CLIENT_ID}  (project=${PROJECT_ID} db=${DB_ID})`);
  await seedClient();
  await mergeProductMetricRefs();
  if (APPLY) {
    const client = await db.collection('clients').doc(CLIENT_ID).get();
    const dataset = client.data()?.productBindings?.[0]?.datasets?.[0];
    console.log(`\nVerificação: contractRef=${dataset?.contractRef} datasetId=${dataset?.datasetId} bindings=${Object.keys(dataset?.schemaBindings ?? {}).length}`);
  }
}
main().catch((err) => { console.error('[seed-real-estate-client] FAILED:', err.message ?? err); process.exit(1); });
