#!/usr/bin/env node

/**
 * Estende o Data Contract `liquid-play-plus` (Firestore) com as entidades e
 * atributos do cliente Vila Rosa (datasets `vila_rosa_covenants.*`).
 *
 * Aditivo e idempotente:
 *   - Cria entidades novas: ficha_cadastral, mapa_de_vendas, evolucao_obra,
 *     evolucao_plano_empresario.
 *   - Adiciona atributos que faltarem em entidades já existentes do piloto
 *     Galli: covenants_calculo, certidoes, transacoes.
 *   - NUNCA sobrescreve um atributo já existente. Se o tipo já gravado no
 *     Firestore divergir do schema BigQuery do Vila Rosa, o script NÃO grava
 *     e lista o conflito no resumo final ("diverge").
 *   - NÃO toca na entidade legada `evolucao` (era do cliente Galli, removido
 *     na purga).
 *   - NÃO cria o dataContract `liquid-play-plus` do zero — ele deve já
 *     existir. Se não existir, o script aborta com erro.
 *
 * Fonte dos schemas: docs/bases/vila-rosa/BigQuery/*.json (introspecção
 * BigQuery, todas as colunas NULLABLE). Descrições PT-BR inferidas de
 * docs/bases/vila-rosa/MAPEAMENTO.md.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-liquid-play-plus-v2-contract.mjs --dry-run
 *   pnpm exec tsx scripts/seed-liquid-play-plus-v2-contract.mjs --apply [--allow-prod]
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();
const CONTRACT_ID = 'liquid-play-plus';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-liquid-play-plus-v2-contract' });

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

// ─────────────────────────────────────────────────────────────────────
// BigQuery → FieldType mapping (mesmo enum de src/shared/schemas/product.ts,
// replicado aqui — este script é standalone, sem imports de src/, igual ao
// padrão de scripts/seed-liquid-play-contracts.mjs).
// ─────────────────────────────────────────────────────────────────────
const KNOWN_FIELD_TYPES = [
  'STRING', 'INT64', 'NUMERIC', 'BIGNUMERIC', 'FLOAT64', 'BOOL',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BYTES', 'GEOGRAPHY', 'JSON',
];

function bqTypeToFieldType(bqType) {
  const t = String(bqType).toUpperCase();
  if (KNOWN_FIELD_TYPES.includes(t)) return t;
  if (t.startsWith('NUMERIC')) return 'NUMERIC';
  if (t.startsWith('BIGNUMERIC')) return 'BIGNUMERIC';
  return 'STRING';
}

// ─────────────────────────────────────────────────────────────────────
// Validação de shape (sem Zod — o seed v1 também não valida com Zod;
// mantém o script standalone e evita o import de módulos TS a partir de um
// entrypoint .mjs, que o tsx não resolve como named exports).
// ─────────────────────────────────────────────────────────────────────
function assertEntityShape(entityId, def) {
  const errors = [];
  if (!def.label || typeof def.label !== 'string') errors.push('label ausente/invalido');
  if (typeof def.description !== 'string' || !def.description) errors.push('description ausente/invalida');
  if (!Array.isArray(def.columns) || def.columns.length === 0) errors.push('columns vazio');
  const seen = new Set();
  for (const col of def.columns ?? []) {
    if (!col.name || !/^[a-z][a-z0-9_]*$/.test(col.name)) {
      errors.push(`coluna com nome invalido: ${JSON.stringify(col.name)}`);
    }
    if (seen.has(col.name)) errors.push(`coluna duplicada: ${col.name}`);
    seen.add(col.name);
    if (!KNOWN_FIELD_TYPES.includes(bqTypeToFieldType(col.bqType))) {
      errors.push(`coluna ${col.name} com bqType invalido: ${col.bqType}`);
    }
    if (typeof col.description !== 'string' || !col.description) {
      errors.push(`coluna ${col.name} sem description`);
    }
  }
  if (errors.length) {
    throw new Error(`Shape invalido em entity "${entityId}": ${errors.join('; ')}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Entidades novas (Vila Rosa) — docs/bases/vila-rosa/BigQuery/*.json
// ─────────────────────────────────────────────────────────────────────

const NEW_ENTITIES = {
  ficha_cadastral: {
    label: 'Ficha Cadastral',
    description: 'Dados cadastrais do empreendimento (dimensão, uma linha por projeto — sem data_base_report).',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'empresa_cnpj', bqType: 'STRING', description: 'CNPJ da SPE responsável pelo projeto.' },
      { name: 'empresa_banco', bqType: 'STRING', description: 'Banco parceiro/financiador do plano empresário.' },
      { name: 'projeto_nome_exibicao', bqType: 'STRING', description: 'Nome comercial de exibição do empreendimento.' },
      { name: 'projeto_tipo', bqType: 'STRING', description: 'Tipo do empreendimento (ex.: residencial, comercial).' },
      { name: 'projeto_estado', bqType: 'STRING', description: 'UF onde o empreendimento está localizado.' },
      { name: 'projeto_cidade', bqType: 'STRING', description: 'Cidade onde o empreendimento está localizado.' },
      { name: 'projeto_vgv', bqType: 'FLOAT64', description: 'Valor Geral de Vendas (VGV) total do projeto.' },
      { name: 'projeto_torres', bqType: 'INT64', description: 'Quantidade de torres do empreendimento.' },
      { name: 'projeto_total_unidades', bqType: 'INT64', description: 'Total de unidades do projeto.' },
      { name: 'projeto_total_m2', bqType: 'FLOAT64', description: 'Área total do projeto, em m².' },
      { name: 'projeto_previsao_entrega', bqType: 'DATE', description: 'Data prevista de entrega da obra.' },
      { name: 'plano_empresario_valor', bqType: 'FLOAT64', description: 'Valor total contratado do plano empresário (financiamento à produção).' },
      { name: 'plano_empresario_data_assinatura', bqType: 'DATE', description: 'Data de assinatura do plano empresário.' },
      { name: 'pluggy_item_id', bqType: 'STRING', description: 'ID do item Pluggy (Open Finance) vinculado à conta bancária do projeto.' },
    ],
  },
  mapa_de_vendas: {
    label: 'Mapa de Vendas',
    description: 'Detalhamento de vendas por unidade: pavimento, área, avaliação e permuta (grão unidade × mês).',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'empreendimento', bqType: 'STRING', description: 'Nome do empreendimento/torre da unidade.' },
      { name: 'pavimento', bqType: 'STRING', description: 'Pavimento/andar da unidade.' },
      { name: 'unidade', bqType: 'STRING', description: 'Identificador da unidade (string — cast necessário ao juntar com contratos.unidade, que é INT64).' },
      { name: 'torre', bqType: 'STRING', description: 'Torre/bloco da unidade.' },
      { name: 'area_privativa', bqType: 'FLOAT64', description: 'Área privativa da unidade, em m².' },
      { name: 'area_calculo', bqType: 'FLOAT64', description: 'Área de cálculo da unidade, em m².' },
      { name: 'area_total', bqType: 'FLOAT64', description: 'Área total da unidade, incluindo áreas comuns, em m².' },
      { name: 'fracao_ideal', bqType: 'FLOAT64', description: 'Fração ideal da unidade no condomínio/terreno.' },
      { name: 'vagas', bqType: 'INT64', description: 'Quantidade de vagas de garagem vinculadas à unidade.' },
      { name: 'valor_avaliacao', bqType: 'FLOAT64', description: 'Valor de avaliação da unidade.' },
      { name: 'valor_liquidez', bqType: 'FLOAT64', description: 'Valor de liquidez (venda forçada) da unidade.' },
      { name: 'permuta', bqType: 'BOOL', description: 'Indica se a unidade é destinada a permuta (true) ou disponível como garantia (false).' },
    ],
  },
  evolucao_obra: {
    label: 'Evolução de Obra',
    description: 'Curva física da obra: previsto × realizado por medição (grão projeto × mês × medição).',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'medicao', bqType: 'STRING', description: 'Rótulo da medição física da obra (ex.: Inicial, 2ª medição).' },
      { name: 'data_medicao', bqType: 'DATE', description: 'Data em que a medição física da obra foi realizada.' },
      { name: 'previsto_acumulado', bqType: 'FLOAT64', description: 'Percentual previsto acumulado de evolução física da obra.' },
      { name: 'previsto_periodo', bqType: 'FLOAT64', description: 'Percentual previsto de evolução física no período da medição.' },
      { name: 'realizado_acumulado', bqType: 'FLOAT64', description: 'Percentual realizado acumulado de evolução física da obra.' },
      { name: 'realizado_periodo', bqType: 'FLOAT64', description: 'Percentual realizado de evolução física no período da medição.' },
      { name: 'desvio_acumulado', bqType: 'FLOAT64', description: 'Desvio acumulado entre realizado e previsto (realizado − previsto).' },
      { name: 'desvio_periodo', bqType: 'FLOAT64', description: 'Desvio no período entre realizado e previsto.' },
    ],
  },
  evolucao_plano_empresario: {
    label: 'Evolução do Plano Empresário',
    description: 'Saldo devedor e contratado do plano empresário (financiamento à produção) por snapshot (grão projeto × mês).',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'plano_empresario_divida_atual', bqType: 'FLOAT64', description: 'Saldo devedor atual do plano empresário (financiamento à produção).' },
      { name: 'plano_empresario_contratado', bqType: 'FLOAT64', description: 'Valor contratado/liberado do plano empresário até o snapshot.' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────
// Entidades existentes (piloto Galli) — lista COMPLETA de colunas do
// schema Vila Rosa. Atributos que já existem no Firestore não são
// sobrescritos (ver processEntity); a lista serve para o diff e para
// permitir a criação em um ambiente onde a entidade ainda não exista.
// ─────────────────────────────────────────────────────────────────────

const EXTENDED_ENTITIES = {
  covenants_calculo: {
    label: 'Cálculo de Covenants',
    description: 'Métricas calculadas para covenants: VSO, estoque, recebíveis e índices.',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'unidades_vendidas', bqType: 'INT64', description: 'Quantidade de unidades vendidas (contratos ativos/quitados) até o snapshot.' },
      { name: 'vendido_m2', bqType: 'FLOAT64', description: 'Área vendida acumulada, em m².' },
      { name: 'valor_vendido', bqType: 'FLOAT64', description: 'Valor vendido acumulado até o snapshot.' },
      { name: 'estoque', bqType: 'INT64', description: 'Quantidade de unidades em estoque (não vendidas).' },
      { name: 'estoque_m2', bqType: 'FLOAT64', description: 'Área em estoque, em m².' },
      { name: 'vuv3_estoque', bqType: 'FLOAT64', description: 'Valor do estoque pelo VUV3 (Valor Unitário de Venda — últimas 3 vendas).' },
      { name: 'vuv3_m2', bqType: 'FLOAT64', description: 'Valor unitário por m² pelo VUV3 (últimas 3 vendas).' },
      { name: 'vuva_estoque', bqType: 'FLOAT64', description: 'Valor do estoque pelo VUVA (Valor Unitário de Venda — Avaliação).' },
      { name: 'vuva_m2', bqType: 'FLOAT64', description: 'Valor unitário por m² pelo VUVA (avaliação).' },
      { name: 'recebiveis_pre_chaves', bqType: 'FLOAT64', description: 'Recebíveis futuros esperados antes da entrega das chaves.' },
      { name: 'recebiveis_pos_chaves', bqType: 'FLOAT64', description: 'Recebíveis futuros esperados após a entrega das chaves.' },
      { name: 'indice_recebivel', bqType: 'FLOAT64', description: 'Índice de cobertura: recebíveis pós-chaves sobre a dívida/saldo de referência.' },
      { name: 'indice_recebivel_estoque', bqType: 'FLOAT64', description: 'Índice de cobertura incluindo o valor do estoque remanescente.' },
      // ── novos (Vila Rosa) ──
      { name: 'vgv', bqType: 'FLOAT64', description: 'Valor Geral de Vendas (VGV) do projeto.' },
      { name: 'total_de_unidades', bqType: 'INT64', description: 'Total de unidades consideradas na base de garantia/covenant.' },
      { name: 'total_m2', bqType: 'FLOAT64', description: 'Área total (m²) considerada na base de garantia/covenant.' },
      { name: 'total_valor_vendido', bqType: 'FLOAT64', description: 'Valor total vendido acumulado até o snapshot.' },
      { name: 'valor_medio_m2', bqType: 'FLOAT64', description: 'Valor médio de venda por m².' },
      { name: 'valor_estoque', bqType: 'FLOAT64', description: 'Valor de mercado do estoque remanescente (unidades não vendidas).' },
    ],
  },
  certidoes: {
    label: 'Certidões',
    description: 'Certidões consultadas em bureaus por empresa/projeto (situação fiscal, trabalhista, etc.).',
    columns: [
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'cnpj_consultado', bqType: 'INT64', description: 'CNPJ consultado no bureau de certidões.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'data_consulta', bqType: 'DATE', description: 'Data em que a certidão foi consultada no bureau.' },
      { name: 'certidao_orgao', bqType: 'STRING', description: 'Órgão emissor da certidão (ex.: SEFAZ-GO, PGFN, TST).' },
      { name: 'certidao', bqType: 'STRING', description: 'Nome/descrição da certidão consultada.' },
      { name: 'tipo', bqType: 'STRING', description: 'Esfera da certidão (ex.: ESTADUAL, FEDERAL, MUNICIPAL, TRABALHISTA).' },
      { name: 'situacao', bqType: 'STRING', description: 'Situação retornada pelo órgão emissor (ex.: NEGATIVA, POSITIVA).' },
      { name: 'id', bqType: 'STRING', description: 'Identificador único do registro de certidão.', isKey: true },
      { name: 'created_at', bqType: 'STRING', description: 'Timestamp de criação do registro na fonte (ISO 8601).' },
      { name: 'endpoint', bqType: 'STRING', description: 'Endpoint da API do bureau utilizado na consulta.' },
      { name: 'bureau', bqType: 'STRING', description: 'Bureau/provedor consultado (ex.: IA).' },
      // ── novos (Vila Rosa) ──
      { name: 'data_validade', bqType: 'DATE', description: 'Data de validade da certidão consultada.' },
      { name: 'status', bqType: 'STRING', description: 'Status consolidado da certidão (ex.: Válida, Inválida).' },
    ],
  },
  transacoes: {
    label: 'Transações Bancárias',
    description: 'Lançamentos bancários: pagador, recebedor, valor, saldo e categoria.',
    columns: [
      { name: 'id', bqType: 'STRING', description: 'Identificador único do lançamento bancário (Pluggy).', isKey: true },
      { name: 'lancamento', bqType: 'STRING', description: 'Descrição resumida do lançamento bancário.' },
      { name: 'descricao', bqType: 'STRING', description: 'Descrição detalhada do lançamento bancário.' },
      { name: 'moeda', bqType: 'STRING', description: 'Moeda do lançamento (ex.: BRL).' },
      { name: 'valor', bqType: 'FLOAT64', description: 'Valor do lançamento (positivo/negativo conforme tipo).' },
      { name: 'data', bqType: 'DATE', description: 'Data do lançamento bancário.' },
      { name: 'saldo', bqType: 'FLOAT64', description: 'Saldo da conta após o lançamento.' },
      { name: 'pagador_conta', bqType: 'STRING', description: 'Número da conta do pagador.' },
      { name: 'pagador_agencia', bqType: 'STRING', description: 'Agência do pagador.' },
      { name: 'pagador_tipo', bqType: 'STRING', description: 'Tipo de documento do pagador (ex.: CNPJ, CPF).' },
      { name: 'pagador_documento', bqType: 'STRING', description: 'Documento (CNPJ/CPF) do pagador.' },
      { name: 'pagador', bqType: 'STRING', description: 'Nome do pagador.' },
      { name: 'pagador_banco', bqType: 'INT64', description: 'Código do banco do pagador (COMPE).' },
      { name: 'metodo_pagamento', bqType: 'STRING', description: 'Método de pagamento utilizado no lançamento.' },
      { name: 'recebedor_conta', bqType: 'STRING', description: 'Número da conta do recebedor.' },
      { name: 'recebedor_agencia', bqType: 'STRING', description: 'Agência do recebedor.' },
      { name: 'recebedor_tipo', bqType: 'STRING', description: 'Tipo de documento do recebedor (ex.: CNPJ, CPF).' },
      { name: 'recebedor_documento', bqType: 'STRING', description: 'Documento (CNPJ/CPF) do recebedor.' },
      { name: 'recebedor', bqType: 'STRING', description: 'Nome do recebedor.' },
      { name: 'recebedor_banco', bqType: 'INT64', description: 'Código do banco do recebedor (COMPE).' },
      { name: 'tipo', bqType: 'STRING', description: 'Natureza do lançamento (CREDIT ou DEBIT).' },
      { name: 'banco_codigo', bqType: 'INT64', description: 'Código do banco (COMPE) da conta do projeto.' },
      { name: 'agencia_codigo', bqType: 'STRING', description: 'Código da agência da conta do projeto.' },
      { name: 'conta_codigo', bqType: 'STRING', description: 'Código da conta do projeto.' },
      { name: 'data_base_report', bqType: 'DATE', description: 'Data-base (snapshot mensal) do relatório.' },
      { name: 'categoria', bqType: 'STRING', description: 'Categoria do lançamento na taxonomia Pluggy (join com BA - Pluggy Transactions ID).' },
      { name: 'projeto', bqType: 'STRING', description: 'Nome do projeto/SPE.' },
      { name: 'empresa', bqType: 'STRING', description: 'Identificador interno da empresa/SPE (slug).' },
    ],
  },
};

const ALL_TARGET_ENTITIES = { ...NEW_ENTITIES, ...EXTENDED_ENTITIES };

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function logPlan(action, path, extra = '') {
  const tag = action === 'create' ? '+' : action === 'diverge' ? '!' : ' ';
  console.log(`  ${tag} ${path}${extra ? '  ' + extra : ''}`);
}

const summary = {};

async function processEntity(entityId, def) {
  assertEntityShape(entityId, def);

  const eRef = db.collection('dataContracts').doc(CONTRACT_ID).collection('entities').doc(entityId);
  const eSnap = await eRef.get();
  const entityAction = eSnap.exists ? 'existe' : 'criar';
  const stat = { entityAction, attrsCreate: [], attrsExist: [], attrsDiverge: [] };
  summary[entityId] = stat;
  const now = Timestamp.now();

  console.log(`\nEntity: ${entityId}  (${entityAction === 'criar' ? 'CRIAR' : 'já existe'}, ${def.columns.length} attrs no schema Vila Rosa)`);

  if (!eSnap.exists) {
    logPlan('create', `entities/${entityId}`, def.label);
    if (APPLY) {
      await eRef.set({
        label: def.label,
        description: def.description,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    }
  }

  for (const col of def.columns) {
    const aRef = eRef.collection('attributes').doc(col.name);
    const aSnap = await aRef.get();
    const targetType = bqTypeToFieldType(col.bqType);

    if (!aSnap.exists) {
      stat.attrsCreate.push(col.name);
      logPlan('create', `${entityId}.${col.name}`, targetType);
      if (APPLY) {
        await aRef.set({
          entityId,
          label: col.name,
          description: col.description,
          type: targetType,
          unit: null,
          isKey: !!col.isKey,
          required: !!col.isKey,
          deprecated: false,
          deprecatedReason: null,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }
      continue;
    }

    const existingType = aSnap.data()?.type;
    if (existingType === targetType) {
      stat.attrsExist.push(col.name);
      logPlan('exist', `${entityId}.${col.name}`, `${targetType} (já existe — não gravado)`);
    } else {
      stat.attrsDiverge.push({ name: col.name, existingType, targetType });
      logPlan('diverge', `${entityId}.${col.name}`, `existente=${existingType}  vila-rosa=${targetType}  (NÃO sobrescrito)`);
    }
  }
}

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'APPLY';
  console.log(`${mode} — estende dataContracts/${CONTRACT_ID} com entidades Vila Rosa`);
  console.log(`Project: ${PROJECT_ID}  DB: ${DB_ID}`);

  const contractRef = db.collection('dataContracts').doc(CONTRACT_ID);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) {
    console.error(`\nErro: dataContracts/${CONTRACT_ID} não existe — este script só estende um contrato existente, não o cria do zero.`);
    process.exit(1);
  }
  console.log(`dataContracts/${CONTRACT_ID} já existe (v${contractSnap.data()?.version ?? '?'}, status=${contractSnap.data()?.status ?? '?'}).`);

  for (const [entityId, def] of Object.entries(ALL_TARGET_ENTITIES)) {
    await processEntity(entityId, def);
  }

  console.log('\n─── Resumo ───');
  let totalCreate = 0;
  let totalExist = 0;
  let totalDiverge = 0;
  for (const [entityId, stat] of Object.entries(summary)) {
    totalCreate += stat.attrsCreate.length;
    totalExist += stat.attrsExist.length;
    totalDiverge += stat.attrsDiverge.length;
    console.log(
      `  ${entityId}: entidade=${stat.entityAction}  criar=${stat.attrsCreate.length}  existe=${stat.attrsExist.length}  diverge=${stat.attrsDiverge.length}`,
    );
  }
  console.log(`  TOTAL: criar=${totalCreate}  existe=${totalExist}  diverge=${totalDiverge}`);

  if (totalDiverge > 0) {
    console.log('\nCONCERN — atributos com tipo divergente (NÃO sobrescritos):');
    for (const [entityId, stat] of Object.entries(summary)) {
      for (const d of stat.attrsDiverge) {
        console.log(`  - ${entityId}.${d.name}: existente=${d.existingType}  vila-rosa=${d.targetType}`);
      }
    }
  }

  console.log(`\nLembrete: entidade legada "evolucao" (Galli) não é tocada por este script.`);

  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado)');
  else console.log('\nConcluído.');
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
