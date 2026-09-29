#!/usr/bin/env node

/**
 * Cria as Relations (chaves de JOIN cross-contract, coleção top-level
 * `relations/{id}` — schema `src/shared/schemas/relation.ts`) necessárias
 * para as métricas `derived` do Covenants v2 (Vila Rosa).
 *
 * Aditivo e idempotente:
 *   - Cria a relation se o id ainda não existir em `relations/`.
 *   - Se o id já existir com o MESMO conteúdo (leftRef/rightRef/cardinality/
 *     label/description), não regrava (idempotência real — 0 writes no
 *     re-run).
 *   - Se o id já existir com conteúdo DIFERENTE, NÃO sobrescreve — reporta
 *     como conflito no resumo final.
 *   - Antes de gravar qualquer relation, valida que os 3 segmentos de cada
 *     ref ("contractId.entityId.attributeId") existem de fato no Firestore
 *     (dataContracts/{contractId}, .../entities/{entityId},
 *     .../attributes/{attributeId}). Se qualquer segmento faltar, o script
 *     aborta sem gravar nada (fail-loud — nunca cria uma relation apontando
 *     para um attribute inexistente).
 *
 * Relations criadas (exatamente 2 — ver nota sobre a 3ª abaixo):
 *
 *   1. fluxo-caixa-contratos
 *      liquid-play.fluxo_caixa.id_contrato → liquid-play.contratos.id_contrato
 *      many-to-one. Junta parcela do fluxo de caixa ao contrato de origem.
 *      Nas recipes derived (Task 11), o JOIN via esta relation deve SEMPRE
 *      vir acompanhado de uma igualdade adicional em `data_base_report`
 *      (ambas entidades são snapshots mensais) — a relation só declara a
 *      chave lógica id_contrato; ela não expressa condições compostas.
 *
 *   2. contratos-mapa-de-vendas
 *      liquid-play.contratos.unidade → liquid-play-plus.mapa_de_vendas.unidade
 *      many-to-one. Junta o contrato à unidade correspondente no mapa de
 *      vendas. ATENÇÃO: no schema físico do Vila Rosa,
 *      vila_rosa_monitor.contratos.unidade é INT64 e
 *      vila_rosa_covenants.mapa_de_vendas.unidade é STRING — as recipes
 *      derived (Task 11) precisam envolver o lado contratos em
 *      `CAST(... AS STRING)` ao montar o JOIN. `RelationDoc` não tem campo
 *      para expressar cast; por isso o cast fica documentado aqui e
 *      implementado na recipe, não na relation.
 *
 * NÃO criada: transacoes × ba_bancos (banco_codigo = numero_codigo).
 *   `ba_bancos` é uma tabela auxiliar em `liquid_aux` (fora de qualquer Data
 *   Contract — `RelationDoc.leftRef`/`rightRef` exigem
 *   "contractId.entityId.attributeId", e não há contractId para uma tabela
 *   aux). Este join não pode ser expresso como Relation; ele será SQL
 *   literal na recipe `derived` (kind: 'sql' ou WHERE literal) da Task 11.
 *
 * Usage:
 *   node scripts/seed-covenants-v2-relations.mjs --dry-run
 *   node scripts/seed-covenants-v2-relations.mjs --apply [--allow-prod]
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-covenants-v2-relations' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

// ─────────────────────────────────────────────────────────────────────
// Validação de shape (sem Zod — script standalone, mesmo padrão de
// scripts/seed-liquid-play-plus-v2-contract.mjs; tsx não resolve named
// exports .ts de entrypoint .mjs).
// ─────────────────────────────────────────────────────────────────────
const ATTRIBUTE_REF_RE = /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const CARDINALITIES = ['one-to-one', 'many-to-one', 'one-to-many', 'many-to-many'];

function assertRelationShape(id, def) {
  const errors = [];
  if (!SLUG_RE.test(id)) errors.push(`id "${id}" não é kebab-case`);
  if (!def.label || typeof def.label !== 'string') errors.push('label ausente/invalido');
  if (!ATTRIBUTE_REF_RE.test(def.leftRef)) errors.push(`leftRef invalido: ${def.leftRef}`);
  if (!ATTRIBUTE_REF_RE.test(def.rightRef)) errors.push(`rightRef invalido: ${def.rightRef}`);
  if (!CARDINALITIES.includes(def.cardinality)) errors.push(`cardinality invalida: ${def.cardinality}`);
  if (def.description != null && typeof def.description !== 'string') errors.push('description invalida');
  if (errors.length) {
    throw new Error(`Shape invalido em relation "${id}": ${errors.join('; ')}`);
  }
}

function splitRef(ref) {
  const [contractId, entityId, attributeId] = ref.split('.');
  return { contractId, entityId, attributeId };
}

// ─────────────────────────────────────────────────────────────────────
// Relations alvo
// ─────────────────────────────────────────────────────────────────────
const RELATIONS = {
  'fluxo-caixa-contratos': {
    label: 'Fluxo de Caixa → Contratos',
    leftRef: 'liquid-play.fluxo_caixa.id_contrato',
    rightRef: 'liquid-play.contratos.id_contrato',
    cardinality: 'many-to-one',
    description:
      'Junta cada parcela do fluxo de caixa ao contrato de origem por id_contrato. ' +
      'Ambas as entidades são snapshots mensais: as recipes derived que usarem esta ' +
      'relation devem sempre igualar também data_base_report entre fluxo_caixa e ' +
      'contratos, além do JOIN por id_contrato expresso aqui.',
  },
  'contratos-mapa-de-vendas': {
    label: 'Contratos → Mapa de Vendas',
    leftRef: 'liquid-play.contratos.unidade',
    rightRef: 'liquid-play-plus.mapa_de_vendas.unidade',
    cardinality: 'many-to-one',
    description:
      'Junta o contrato à unidade correspondente no mapa de vendas por unidade. ' +
      'No schema físico do Vila Rosa, contratos.unidade é INT64 e ' +
      'mapa_de_vendas.unidade é STRING — as recipes derived que usarem esta relation ' +
      'precisam aplicar CAST(contratos.unidade AS STRING) ao montar o JOIN.',
  },
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
async function refExists(ref) {
  const { contractId, entityId, attributeId } = splitRef(ref);
  const contractSnap = await db.collection('dataContracts').doc(contractId).get();
  if (!contractSnap.exists) return { ok: false, reason: `dataContracts/${contractId} não existe` };
  const entitySnap = await db
    .collection('dataContracts').doc(contractId)
    .collection('entities').doc(entityId)
    .get();
  if (!entitySnap.exists) return { ok: false, reason: `dataContracts/${contractId}/entities/${entityId} não existe` };
  const attrSnap = await entitySnap.ref.collection('attributes').doc(attributeId).get();
  if (!attrSnap.exists) {
    return { ok: false, reason: `dataContracts/${contractId}/entities/${entityId}/attributes/${attributeId} não existe` };
  }
  return { ok: true, type: attrSnap.data()?.type };
}

function sameContent(existingData, target) {
  const norm = (d) => ({
    label: d.label,
    leftRef: d.leftRef,
    rightRef: d.rightRef,
    cardinality: d.cardinality,
    description: d.description ?? null,
  });
  const a = norm(existingData);
  const b = norm(target);
  return JSON.stringify(a) === JSON.stringify(b);
}

const summary = { create: [], exist: [], conflict: [] };

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`${mode} — seed de relations/ (covenants v2)`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}`);

  // 1) Validar shape de todas as defs antes de tocar no Firestore.
  for (const [id, def] of Object.entries(RELATIONS)) {
    assertRelationShape(id, def);
  }

  // 2) Validar que todos os refs (leftRef/rightRef) existem de fato.
  console.log('\n--- Validação de refs ---');
  const allRefs = new Set();
  for (const def of Object.values(RELATIONS)) {
    allRefs.add(def.leftRef);
    allRefs.add(def.rightRef);
  }
  const refCheckErrors = [];
  for (const ref of allRefs) {
    const res = await refExists(ref);
    if (res.ok) {
      console.log(`  OK  ${ref}  (type=${res.type})`);
    } else {
      console.log(`  FALTA  ${ref}  — ${res.reason}`);
      refCheckErrors.push(`${ref}: ${res.reason}`);
    }
  }
  if (refCheckErrors.length) {
    console.error('\nErro: refs ausentes no Firestore, abortando sem gravar nada:');
    for (const e of refCheckErrors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // 3) Para cada relation, decidir criar / já existe / conflito.
  console.log('\n--- Relations ---');
  const now = Timestamp.now();
  for (const [id, def] of Object.entries(RELATIONS)) {
    const ref = db.collection('relations').doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      summary.create.push(id);
      console.log(`  + relations/${id}  (CRIAR)`);
      console.log(`      leftRef=${def.leftRef}  rightRef=${def.rightRef}  cardinality=${def.cardinality}`);
      if (APPLY) {
        await ref.set(
          {
            label: def.label,
            leftRef: def.leftRef,
            rightRef: def.rightRef,
            cardinality: def.cardinality,
            description: def.description ?? null,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true },
        );
      }
      continue;
    }

    const existingData = snap.data();
    if (sameContent(existingData, def)) {
      summary.exist.push(id);
      console.log(`  = relations/${id}  (já existe — conteúdo idêntico, nada a gravar)`);
    } else {
      summary.conflict.push({ id, existingData, target: def });
      console.log(`  ! relations/${id}  (já existe com conteúdo DIFERENTE — NÃO sobrescrito)`);
      console.log(`      existente: leftRef=${existingData.leftRef}  rightRef=${existingData.rightRef}  cardinality=${existingData.cardinality}`);
      console.log(`      alvo:      leftRef=${def.leftRef}  rightRef=${def.rightRef}  cardinality=${def.cardinality}`);
    }
  }

  console.log('\n─── Resumo ───');
  console.log(`  criar=${summary.create.length}  existe=${summary.exist.length}  conflito=${summary.conflict.length}`);
  if (summary.conflict.length) {
    console.log('\nCONCERN — relations com conteúdo divergente (NÃO sobrescritas):');
    for (const c of summary.conflict) console.log(`  - ${c.id}`);
  }

  console.log(
    '\nLembrete: transacoes × ba_bancos NÃO é criada aqui (ba_bancos é tabela aux ' +
    'liquid_aux, fora de contrato — join fica SQL literal na recipe da Task 11).',
  );

  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)');
  else console.log('\nConcluído.');
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
