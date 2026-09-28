#!/usr/bin/env node

/**
 * Cria o grupo `covenants` ("Covenants") e os 13 reports do cliente
 * `vila-rosa`, replicando a navegação do Looker Studio original
 * (`docs/bases/vila-rosa/MAPEAMENTO.md` §1) a partir dos 13 templates
 * `covenants-v2-*` já publicados em Firestore `dashboardTemplates/`
 * (Task 13 — inclui o fix 3cd0755, por isso os templates são lidos do
 * Firestore, NÃO dos `.mjs` em `scripts/templates/`).
 *
 * Import = mesmo comportamento de `createReport`
 * (`src/shared/lib/firestore/reports.ts:75-107`) e de
 * `TemplateGallery.handleImport`
 * (`src/widgets/nav-sidebar/ui/TemplateGallery.tsx:157-176`): deep-copy de
 * `blockMap`/`layout`/`filters`/`queries` + copiar `description`,
 * `templateId` (lineage — necessária para o resolvedor de drill-through em
 * `src/pages/report/ui/drill-through.ts`, que casa `{report:<templateId>}`
 * com o report do MESMO grupo cujo `Report.templateId` bate), `productRefs`,
 * `metricRefs`. Diferente da rota `/api/reports` (POST usa `.add()` — id
 * aleatório), aqui gravamos direto via firebase-admin com `.doc(slug).set()`
 * para ids estáveis, como pedido no brief.
 *
 * Molde de dry-run/apply/force + guarda anti-sobrescrita:
 * `scripts/seed-vila-rosa-client.mjs` (`stableStringify` + comparação antes
 * de gravar). Idempotente: re-rodar sem --force não duplica nem sobrescreve
 * grupo/report cujo conteúdo já divirja do que este script geraria.
 *
 * Usage:
 *   pnpm exec node scripts/seed-vila-rosa-reports.mjs --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=... pnpm exec node scripts/seed-vila-rosa-reports.mjs --apply [--allow-prod]
 *   GOOGLE_APPLICATION_CREDENTIALS=... pnpm exec node scripts/seed-vila-rosa-reports.mjs --apply --force
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-vila-rosa-reports' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

const CLIENT_ID = 'vila-rosa';
const GROUP_ID = 'covenants';
const GROUP_NAME = 'Covenants';
const GROUP_ORDER = 1;

// ─────────────────────────────────────────────────────────────────────
// Ordem/nomes das 13 páginas — navegação do Looker
// (docs/bases/vila-rosa/MAPEAMENTO.md §1).
// ─────────────────────────────────────────────────────────────────────
const REPORTS = [
  { id: 'visao-executiva', name: 'Covenants', templateId: 'covenants-v2-visao-executiva' },
  { id: 'empreendimento', name: 'Empreendimento', templateId: 'covenants-v2-empreendimento' },
  { id: 'unidades', name: 'Unidades', templateId: 'covenants-v2-unidades' },
  { id: 'evolucao-obra', name: 'Evolução de Obra', templateId: 'covenants-v2-evolucao-obra' },
  { id: 'mapa-vendas', name: 'Mapa de Vendas', templateId: 'covenants-v2-mapa-vendas' },
  { id: 'recebiveis', name: 'Recebíveis', templateId: 'covenants-v2-recebiveis' },
  { id: 'plano-empresario', name: 'Plano Empresário', templateId: 'covenants-v2-plano-empresario' },
  { id: 'perfil-carteira', name: 'Perfil da Carteira', templateId: 'covenants-v2-perfil-carteira' },
  { id: 'inadimplencia', name: 'Inadimplência', templateId: 'covenants-v2-inadimplencia' },
  { id: 'fluxo-caixa', name: 'Fluxo de Caixa', templateId: 'covenants-v2-fluxo-caixa' },
  { id: 'entradas-saidas', name: 'Entradas & Saídas', templateId: 'covenants-v2-entradas-saidas' },
  { id: 'certidoes', name: 'Situação de Certidões', templateId: 'covenants-v2-certidoes' },
  { id: 'extrato-detalhado', name: 'Extrato Detalhado', templateId: 'covenants-v2-extrato-detalhado' },
].map((r, i) => ({ ...r, order: i + 1 }));

/** Stringify determinístico (chaves ordenadas) — compara docs ignorando timestamps. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Deep-copy + descarta `undefined` (Firestore não aceita) — mesmo truque de seed-covenants-templates.ts. */
function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadTemplate(templateId) {
  const snap = await db.collection('dashboardTemplates').doc(templateId).get();
  if (!snap.exists) {
    throw new Error(`dashboardTemplates/${templateId} não existe — rode a Task 13 primeiro.`);
  }
  return snap.data();
}

/** Monta o payload "desejado" do report a partir do template (mesma lógica de handleImport). */
function buildDesiredReport(template, meta) {
  const desired = {
    name: meta.name,
    order: meta.order,
    blockMap: deepCopy(template.blockMap ?? {}),
    layout: deepCopy(template.layout ?? []),
    templateId: meta.templateId,
  };
  if (template.description) desired.description = template.description;
  if (template.filters && Object.keys(template.filters).length > 0) {
    desired.filters = deepCopy(template.filters);
  }
  if (template.queries && template.queries.length > 0) {
    desired.queries = deepCopy(template.queries);
  }
  if (template.productRefs?.length) desired.productRefs = [...template.productRefs];
  if (template.metricRefs?.length) desired.metricRefs = [...template.metricRefs];
  return desired;
}

/** Normaliza um doc existente do Firestore para o mesmo shape de `buildDesiredReport` (sem timestamps). */
function normalizeExistingReport(data) {
  const normalized = {
    name: data.name ?? '',
    order: data.order ?? 0,
    blockMap: data.blockMap ?? {},
    layout: data.layout ?? [],
  };
  if (data.templateId) normalized.templateId = data.templateId;
  if (data.description) normalized.description = data.description;
  if (data.filters && Object.keys(data.filters).length > 0) normalized.filters = data.filters;
  if (data.queries && data.queries.length > 0) normalized.queries = data.queries;
  if (data.productRefs?.length) normalized.productRefs = data.productRefs;
  if (data.metricRefs?.length) normalized.metricRefs = data.metricRefs;
  return normalized;
}

async function seedGroup() {
  console.log(`\n=== Grupo: clients/${CLIENT_ID}/groups/${GROUP_ID} ===`);
  const ref = db.collection('clients').doc(CLIENT_ID).collection('groups').doc(GROUP_ID);
  const existing = await ref.get();
  const now = Timestamp.now();
  const desired = { name: GROUP_NAME, order: GROUP_ORDER };

  if (existing.exists) {
    const data = existing.data();
    const existingComparable = { name: data.name ?? '', order: data.order ?? 0 };
    const same = stableStringify(existingComparable) === stableStringify(desired);
    if (same) {
      console.log(`  = groups/${GROUP_ID}  (já existe, conteúdo idêntico — no-op)`);
      return;
    }
    if (!FORCE) {
      console.log(`  ! groups/${GROUP_ID}  CONFLITO (conteúdo difere) — pulado, NADA gravado.`);
      console.log('    Rode com --force para sobrescrever (revise a diferença antes).');
      return;
    }
    console.log(`  ~ groups/${GROUP_ID}  (existe, diverge — FORÇANDO sobrescrita, createdAt preservado)`);
    if (APPLY) await ref.set({ ...desired, createdAt: data.createdAt ?? now, updatedAt: now }, { merge: false });
    return;
  }

  console.log(`  + groups/${GROUP_ID}  (criar: name="${GROUP_NAME}", order=${GROUP_ORDER})`);
  if (APPLY) await ref.set({ ...desired, createdAt: now, updatedAt: now });
}

async function seedReport(meta) {
  const template = await loadTemplate(meta.templateId);
  const desired = buildDesiredReport(template, meta);
  const label = `groups/${GROUP_ID}/reports/${meta.id}`;

  const ref = db
    .collection('clients')
    .doc(CLIENT_ID)
    .collection('groups')
    .doc(GROUP_ID)
    .collection('reports')
    .doc(meta.id);
  const existing = await ref.get();
  const now = Timestamp.now();
  const blockCount = Object.keys(desired.blockMap).length;

  if (existing.exists) {
    const data = existing.data();
    const normalizedExisting = normalizeExistingReport(data);
    const same = stableStringify(normalizedExisting) === stableStringify(desired);
    if (same) {
      console.log(`  = ${label}  (já existe, conteúdo idêntico — no-op; blocks=${blockCount})`);
      return;
    }
    if (!FORCE) {
      console.log(`  ! ${label}  CONFLITO (conteúdo difere) — pulado, NADA gravado.`);
      console.log('    Rode com --force para sobrescrever (revise a diferença antes).');
      return;
    }
    console.log(`  ~ ${label}  (existe, diverge — FORÇANDO sobrescrita, createdAt preservado; blocks=${blockCount})`);
    if (APPLY) await ref.set({ ...desired, createdAt: data.createdAt ?? now, updatedAt: now }, { merge: false });
    return;
  }

  console.log(`  + ${label}  (criar: name="${meta.name}", order=${meta.order}, templateId=${meta.templateId}, blocks=${blockCount})`);
  if (APPLY) await ref.set({ ...desired, createdAt: now, updatedAt: now });
}

async function verifyPostApply() {
  console.log('\n=== Verificação pós-apply ===');
  const col = db
    .collection('clients')
    .doc(CLIENT_ID)
    .collection('groups')
    .doc(GROUP_ID)
    .collection('reports');

  let allOk = true;
  const docs = new Map();
  for (const meta of REPORTS) {
    const snap = await col.doc(meta.id).get();
    if (!snap.exists) {
      console.log(`  ✗ ${meta.id}  NÃO ENCONTRADO`);
      allOk = false;
      continue;
    }
    const data = snap.data();
    docs.set(meta.id, data);
    const blockCount = Object.keys(data.blockMap ?? {}).length;
    const ok = blockCount > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${meta.id}  blockMap=${blockCount} templateId=${data.templateId ?? '(ausente)'}`);
    if (!ok) allOk = false;
  }

  // Lineage do drill-through: entradas-saidas deve conter o token
  // `{report:covenants-v2-extrato-detalhado}` em um bloco text.
  const inflowsOutflows = docs.get('entradas-saidas');
  let tokenFound = false;
  if (inflowsOutflows) {
    for (const block of Object.values(inflowsOutflows.blockMap ?? {})) {
      if (block?.type === 'text' && typeof block.content === 'string' &&
          block.content.includes('{report:covenants-v2-extrato-detalhado}')) {
        tokenFound = true;
        break;
      }
    }
  }
  console.log(`  ${tokenFound ? '✓' : '✗'} entradas-saidas contém token drill-through {report:covenants-v2-extrato-detalhado}`);
  if (!tokenFound) allOk = false;

  console.log(allOk ? '\nVerificação OK — 13 reports com blockMap não-vazio, lineage preservada.' : '\nVerificação FALHOU — ver itens ✗ acima.');
  return allOk;
}

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`${mode} — seed grupo "Covenants" + 13 reports para ${CLIENT_ID}`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}`);

  await seedGroup();

  console.log(`\n=== Reports (${REPORTS.length}) ===`);
  for (const meta of REPORTS) {
    await seedReport(meta);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run — nada foi gravado)');
    return;
  }

  console.log('\nConcluído.');
  const ok = await verifyPostApply();
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
