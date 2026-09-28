#!/usr/bin/env node
/**
 * Base mínima de configuração de uma instalação NOVA: origem de dados,
 * contratos `liquid-play`/`liquid-play-plus`, entidades e atributos do monitor
 * e os dois produtos. É o que os seeds do Vila Rosa assumem que já existe.
 *
 * Por que existe: em produção esses documentos vieram de um export de
 * ambiente real (`fixtures/provisioning/`, gitignored). Numa instalação do
 * zero nenhum script os criava — `seed-liquid-play-plus-v2-contract.mjs`
 * aborta com "contrato não existe" e o resto da cadeia nem começa.
 *
 * Duas regras que custaram uma tarde para descobrir:
 *
 *   1. O id do documento em `dataSources/` TEM de ser o id do projeto GCP.
 *      O front monta `${dataSourceId}.${datasetId}` e o servidor
 *      (`/api/filter-options`, tools de IA) lê isso como `projeto.dataset`.
 *      Com `bigquery-default` o BigQuery devolve "Access Denied: Table
 *      bigquery-default:...". Por isso o id aqui é sempre o projeto.
 *
 *   2. Os atributos do contrato `liquid-play` saem de
 *      `lib/vila-rosa-schemas.mjs`, a mesma fonte dos `schemaBindings` do
 *      cliente — contrato e binding não podem divergir.
 *
 * Idempotente e aditivo: documento existente não é tocado (nem com --force,
 * porque a admin pode ter editado descrições). Só cria o que falta.
 *
 * `--apply` no banco de produção (`dataviz`) é recusado sem `--allow-prod`,
 * e `--dry-run` junto com `--apply` é recusado sempre (`lib/production-guard.mjs`).
 *
 * Uso:
 *   pnpm seed:base -- --dry-run [--project=<id>] [--database=<id>] [--location=US]
 *   pnpm seed:base -- --apply [--allow-prod]
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { MONITOR_SCHEMA } from './lib/vila-rosa-schemas.mjs';

const argv = process.argv.slice(2);
const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
if (!DRY_RUN && !APPLY) {
  console.error('Uso: --dry-run | --apply [--allow-prod]  [--project=<id>] [--database=<id>] [--location=US]');
  process.exit(2);
}

const PROJECT_ID = resolveGcpProject(arg('project'));
const DB_ID = resolveDatabaseId(arg('database'));
const BQ_LOCATION = arg('location') ?? process.env.BIGQUERY_LOCATION ?? 'US';
const SEED_AUTHOR = 'seed-base-contracts';
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-base-contracts' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);
const now = Timestamp.now();
const audit = { createdAt: now, updatedAt: now, createdBy: SEED_AUTHOR, updatedBy: SEED_AUTHOR };

const ENTITY_DOCS = {
  contratos: { label: 'Contratos', description: 'Contratos da carteira — snapshot mensal por data_base_report.' },
  pagamentos: { label: 'Pagamentos', description: 'Parcelas pagas por contrato — snapshot mensal por data_base_report.' },
  fluxo_caixa: { label: 'Fluxo de Caixa', description: 'Fluxo contratado e esperado por contrato — snapshot mensal por data_base_report.' },
};
const KEY_COLUMNS = new Set(['id_contrato', 'data_base_report', 'projeto']);

const DOCS = [
  {
    path: `dataSources/${PROJECT_ID}`,
    data: {
      name: `BigQuery (${PROJECT_ID})`,
      projectId: PROJECT_ID,
      location: BQ_LOCATION,
      description: 'Origem BigQuery da instalação. O id do documento é o id do projeto GCP (ver cabeçalho do seed).',
    },
  },
  {
    path: 'dataContracts/liquid-play',
    data: {
      name: 'Liquid Play (monitor de carteira)',
      version: '1.0.0',
      status: 'active',
      description: 'Contrato canônico do monitor de carteira: contratos, pagamentos e fluxo de caixa.',
    },
  },
  {
    path: 'dataContracts/liquid-play-plus',
    data: {
      name: 'Liquid Play Plus (covenants)',
      version: '1.0.0',
      status: 'active',
      description: 'Contrato do produto covenants. Entidades entram por seed-liquid-play-plus-v2-contract.mjs.',
    },
  },
  {
    path: 'products/liquid-play',
    data: {
      name: 'Liquid Play', slug: 'liquid-play', icon: 'chart-line', color: '#2563EB', status: 'active',
      description: 'Monitor de carteira de crédito imobiliário.',
      contractRefs: ['liquid-play'], entityRefs: Object.keys(MONITOR_SCHEMA), metricRefs: [], indicators: [], routes: [],
    },
  },
  {
    path: 'products/liquid-play-plus',
    data: {
      name: 'Liquid Play Plus', slug: 'liquid-play-plus', icon: 'shield-check', color: '#E85D2C', status: 'active',
      description: 'Covenants e acompanhamento de empreendimento.',
      contractRefs: ['liquid-play-plus', 'liquid-play'], entityRefs: [], metricRefs: [], indicators: [], routes: [],
    },
  },
];

for (const [entityId, columns] of Object.entries(MONITOR_SCHEMA)) {
  DOCS.push({ path: `dataContracts/liquid-play/entities/${entityId}`, data: ENTITY_DOCS[entityId] });
  for (const [name, type] of columns) {
    DOCS.push({
      path: `dataContracts/liquid-play/entities/${entityId}/attributes/${name}`,
      data: {
        entityId,
        label: name.replace(/_/g, ' '),
        description: `Coluna ${name} da tabela ${entityId}.`,
        type,
        unit: null,
        isKey: KEY_COLUMNS.has(name),
        required: KEY_COLUMNS.has(name),
        deprecated: false,
        deprecatedReason: null,
      },
    });
  }
}

const main = async () => {
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — base de contratos/produtos`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}  BigQuery location: ${BQ_LOCATION}\n`);

  let toCreate = 0;
  let existing = 0;
  let batch = db.batch();
  let pending = 0;

  for (const { path, data } of DOCS) {
    const ref = db.doc(path);
    const snap = await ref.get();
    if (snap.exists) {
      existing++;
      if (!path.includes('/attributes/')) console.log(`  = ${path}`);
      continue;
    }
    toCreate++;
    if (!path.includes('/attributes/')) console.log(`  + ${path}`);
    if (APPLY) {
      batch.set(ref, { ...data, ...audit });
      if (++pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  }
  if (APPLY && pending > 0) await batch.commit();

  console.log(`\n─── Resumo ───\n  criar=${toCreate}  já existem=${existing}  (atributos contados, não listados)`);
  console.log(DRY_RUN ? '\n(dry-run — nada foi gravado)' : '\nConcluído.');
  if (!DOCS.some((d) => d.path === `dataSources/${PROJECT_ID}`)) return;
  console.log(`\nLembrete: DATA_SOURCE_ID=${PROJECT_ID} no .env.local (os seeds do cliente leem daí).`);
};

main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
