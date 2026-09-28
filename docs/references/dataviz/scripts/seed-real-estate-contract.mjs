#!/usr/bin/env node
/**
 * Base do domínio IMOBILIÁRIA no Firestore: contrato `imobiliaria` com as 20
 * entidades e seus atributos, e o produto `imobiliaria`.
 *
 * Os atributos saem de `lib/real-estate-schemas.mjs` — a MESMA fonte dos
 * `schemaBindings` de `seed-real-estate-client.mjs`. Contrato e binding não
 * podem divergir.
 *
 * Pré-requisito: `dataSources/{projeto}` já existe; sem ele o seed para com erro.
 *
 * Idempotente e aditivo: documento existente não é tocado. Só cria o que falta.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-real-estate-contract.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-real-estate-contract.mjs --apply
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { REAL_ESTATE_SCHEMA, REAL_ESTATE_KEYS, REAL_ESTATE_ENTITIES } from './lib/real-estate-schemas.mjs';

const argv = process.argv.slice(2);
const arg = (key) => argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
if (!DRY_RUN && !APPLY) {
  console.error('Uso: --dry-run | --apply  [--project=<id>] [--database=<id>] [--allow-prod]');
  process.exit(2);
}
const PROJECT_ID = resolveGcpProject(arg('project'));
const DB_ID = resolveDatabaseId(arg('database'));
// Stored as createdBy/updatedBy: the value is data and keeps the original name.
const AUTHOR = 'seed-imobiliaria-base';

assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-real-estate-contract' });
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);
const now = Timestamp.now();
const audit = { createdAt: now, updatedAt: now, createdBy: AUTHOR, updatedBy: AUTHOR };

export const CONTRACT_ID = 'imobiliaria';
export const PRODUCT_ID = 'imobiliaria';

const DOCS = [
  {
    path: `dataContracts/${CONTRACT_ID}`,
    data: {
      name: 'Imobiliária (vendas, lançamentos, locação, marketing e financeiro)',
      version: '1.0.0',
      status: 'active',
      description: 'Contrato do domínio de imobiliárias multi-unidade: estrutura, imóveis, empreendimentos, funil comercial, locação, marketing, DRE e satisfação. Catálogo em docs/imobiliarias-base-de-exemplos.md.',
    },
  },
  {
    path: `products/${PRODUCT_ID}`,
    data: {
      name: 'Imobiliária', slug: PRODUCT_ID, icon: 'building', color: '#0EA5E9', status: 'active',
      description: 'Gestão de imobiliária: vendas de prontos e lançamentos, locação, marketing, financeiro e equipe.',
      contractRefs: [CONTRACT_ID], entityRefs: Object.keys(REAL_ESTATE_SCHEMA), metricRefs: [], indicators: [], routes: [],
    },
  },
];

const UNITS = { valor_: 'BRL', comissao: 'BRL', taxa: 'BRL', investimento: 'BRL', meta_vgv: 'BRL', meta_receita: 'BRL', vgv: 'BRL', area_m2: 'm²', pct: '%', dias: 'dias', minutos: 'min', meses: 'meses' };
function unitOf(column) {
  if (column.endsWith('_pct')) return '%';
  if (/^(dias|minutos|meses)_|_(dias|minutos)$/.test(column)) return column.includes('minuto') ? 'min' : column.includes('meses') ? 'meses' : 'dias';
  if (/^(valor|comissao|taxa|investimento|meta_vgv|meta_receita|vgv|iptu)/.test(column) && !column.endsWith('_pct')) return 'BRL';
  if (column === 'area_m2') return 'm²';
  return null;
}
void UNITS;

for (const [entityId, columns] of Object.entries(REAL_ESTATE_SCHEMA)) {
  DOCS.push({ path: `dataContracts/${CONTRACT_ID}/entities/${entityId}`, data: REAL_ESTATE_ENTITIES[entityId] });
  for (const [column, type] of columns) {
    DOCS.push({
      path: `dataContracts/${CONTRACT_ID}/entities/${entityId}/attributes/${column}`,
      data: {
        entityId,
        label: column.replace(/_/g, ' '),
        description: `Coluna ${column} da tabela ${entityId}.`,
        type,
        unit: unitOf(column),
        isKey: REAL_ESTATE_KEYS.has(column),
        required: REAL_ESTATE_KEYS.has(column),
        deprecated: false,
        deprecatedReason: null,
      },
    });
  }
}

async function main() {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — base do domínio imobiliária`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}\n`);
  const dataSource = await db.doc(`dataSources/${PROJECT_ID}`).get();
  if (!dataSource.exists) {
    console.error(`dataSources/${PROJECT_ID} não existe — rode \`pnpm seed:base -- --apply\` antes (cria a origem com o id do projeto).`);
    process.exit(1);
  }
  let toCreate = 0;
  let existing = 0;
  let batch = db.batch();
  let pending = 0;
  for (const { path, data } of DOCS) {
    const ref = db.doc(path);
    const snap = await ref.get();
    if (snap.exists) { existing++; continue; }
    toCreate++;
    if (path.split('/').length <= 2) console.log(`  + ${path}`);
    if (APPLY) {
      batch.set(ref, { ...data, ...audit });
      if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }
  if (APPLY && pending) await batch.commit();
  console.log(`\n${toCreate} documento(s) ${APPLY ? 'criados' : 'a criar'}, ${existing} já existiam (intocados).`);
  console.log(`Entidades: ${Object.keys(REAL_ESTATE_SCHEMA).length}, atributos: ${Object.values(REAL_ESTATE_SCHEMA).reduce((sum, columns) => sum + columns.length, 0)}.`);
}

main().catch((err) => {
  console.error('[seed-real-estate-contract] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
