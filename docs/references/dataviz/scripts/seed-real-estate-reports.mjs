#!/usr/bin/env node
/**
 * Importa os 25 templates `imobiliaria-*` como reports do cliente `imob-demo`,
 * em 8 grupos (`clients/imob-demo/groups/{g}/reports/{r}`), na ordem de
 * `scripts/templates/real-estate.mjs`. Molde: `seed-vila-rosa-reports.mjs`
 * (mesma lógica de `handleImport`: copia blockMap/layout/filters/metricRefs e
 * guarda `templateId` como linhagem).
 *
 * Idempotente: no-op quando idêntico; conflito pulado sem --force.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-real-estate-reports.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-real-estate-reports.mjs --apply [--force]
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { groups } from './templates/real-estate.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
if (!DRY_RUN && !APPLY) { console.error('Especifique --dry-run ou --apply'); process.exit(2); }
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-real-estate-reports' });
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);
const CLIENT_ID = 'imob-demo';

const deepCopy = (v) => JSON.parse(JSON.stringify(v));
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function buildDesiredReport(template, meta) {
  const d = { name: meta.name, order: meta.order, blockMap: deepCopy(template.blockMap ?? {}), layout: deepCopy(template.layout ?? []), templateId: template.id };
  if (template.description) d.description = template.description;
  if (template.filters && Object.keys(template.filters).length) d.filters = deepCopy(template.filters);
  if (template.productRefs?.length) d.productRefs = [...template.productRefs];
  if (template.metricRefs?.length) d.metricRefs = [...template.metricRefs];
  return d;
}
function normalizeExisting(data) {
  const n = { name: data.name ?? '', order: data.order ?? 0, blockMap: data.blockMap ?? {}, layout: data.layout ?? [] };
  if (data.templateId) n.templateId = data.templateId;
  if (data.description) n.description = data.description;
  if (data.filters && Object.keys(data.filters).length) n.filters = data.filters;
  if (data.productRefs?.length) n.productRefs = data.productRefs;
  if (data.metricRefs?.length) n.metricRefs = data.metricRefs;
  return n;
}
async function upsert(ref, desired, label) {
  const existing = await ref.get();
  const now = Timestamp.now();
  if (existing.exists) {
    const data = existing.data();
    const same = stableStringify(desired.blockMap ? normalizeExisting(data) : { name: data.name ?? '', order: data.order ?? 0 }) === stableStringify(desired);
    if (same) { console.log(`  = ${label}  (idêntico)`); return; }
    if (!FORCE) { console.log(`  ! ${label}  CONFLITO — pulado (use --force)`); return; }
    console.log(`  ~ ${label}  (sobrescrevendo)`);
    if (APPLY) await ref.set({ ...desired, createdAt: data.createdAt ?? now, updatedAt: now }, { merge: false });
    return;
  }
  console.log(`  + ${label}`);
  if (APPLY) await ref.set({ ...desired, createdAt: now, updatedAt: now });
}

async function main() {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — grupos e reports de clients/${CLIENT_ID}  (project=${PROJECT_ID} db=${DB_ID})\n`);
  const client = await db.collection('clients').doc(CLIENT_ID).get();
  if (!client.exists) { console.error(`clients/${CLIENT_ID} não existe — rode seed-real-estate-client.mjs antes.`); process.exit(1); }
  for (const group of groups) {
    const groupRef = db.collection('clients').doc(CLIENT_ID).collection('groups').doc(group.id);
    await upsert(groupRef, { name: group.name, order: group.order }, `groups/${group.id}`);
    for (const [index, template] of group.templates.entries()) {
      const snap = await db.collection('dashboardTemplates').doc(template.id).get();
      if (!snap.exists) { console.error(`  ✗ dashboardTemplates/${template.id} não existe — rode seed-real-estate-templates.ts antes.`); process.exit(1); }
      const reportId = template.id.replace(/^imobiliaria-/, '');
      await upsert(groupRef.collection('reports').doc(reportId), buildDesiredReport({ ...snap.data(), id: template.id }, { name: template.name, order: index + 1 }), `groups/${group.id}/reports/${reportId}`);
    }
  }
  if (APPLY) {
    let total = 0;
    for (const group of groups) total += (await db.collection('clients').doc(CLIENT_ID).collection('groups').doc(group.id).collection('reports').get()).size;
    console.log(`\nVerificação: ${groups.length} grupos, ${total} reports em clients/${CLIENT_ID}.`);
  }
}
main().catch((e) => { console.error('[seed-real-estate-reports] FAILED:', e.message ?? e); process.exit(1); });
