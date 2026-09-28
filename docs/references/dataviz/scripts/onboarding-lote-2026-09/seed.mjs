#!/usr/bin/env node
/**
 * Onboarding do lote de setembro/2026: produtos, contratos e clientes.
 *
 * O que faz, em ordem:
 *   1. VERIFICA os dicionários contra a introspecção do BigQuery. Se um
 *      atributo declarado não existe em nenhum dataset, ou se o tipo declarado
 *      divergir sem estar na lista de divergências conhecidas, o script ABORTA
 *      antes de gravar. Contrato que não descreve o dado é pior que contrato
 *      ausente: mente com autoridade.
 *   2. Cria os produtos `liquid-play` e `backtest`.
 *   3. Estende o contrato `liquid-play` (aditivo — nunca sobrescreve atributo).
 *   4. Cria o contrato `backtest`.
 *   5. Cria os 7 clientes com `schemaBindings` derivados do schema real.
 *
 * Idempotente: reexecutar não duplica nem sobrescreve o que já está certo.
 *
 * Uso:
 *   node scripts/onboarding-lote-2026-09/seed.mjs --schemas <arquivo.json> --dry-run
 *   node scripts/onboarding-lote-2026-09/seed.mjs --schemas <arquivo.json> --apply [--allow-prod]
 *
 * `--db prod` (o default) é o banco `dataviz`: ali `--apply` exige
 * `--allow-prod`. `--dry-run` junto com `--apply` é recusado.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

import { NOVOS_ATRIBUTOS, CORRECOES_DE_TIPO } from './atributos-liquid-play.mjs';
import { ENTIDADES as ENTIDADES_BACKTEST, CAIXA_REAL } from './atributos-backtest.mjs';
import { CLIENTES, SINONIMOS, DATA_SOURCE_ID } from './clientes.mjs';
import { resolveGcpProject, DEFAULT_DATABASE_ID, DEFAULT_DEV_DATABASE_ID } from '../lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from '../lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();

/**
 * Bancos válidos. `dataviz` é o canônico (produção). `dataviz-dev` é o espelho
 * local. Sem poder mirar o espelho, "rodar local" mostra um banco quase vazio.
 */
const BANCOS = {
  prod: DEFAULT_DATABASE_ID,
  dev: DEFAULT_DEV_DATABASE_ID,
};

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const SCHEMAS = argv[argv.indexOf('--schemas') + 1];
const ALVO = argv.includes('--db') ? argv[argv.indexOf('--db') + 1] : 'prod';
const DB_ID = BANCOS[ALVO];

if ((!DRY_RUN && !APPLY) || !SCHEMAS || SCHEMAS.startsWith('--') || !DB_ID) {
  console.error('Uso: --schemas <arquivo.json> [--db prod|dev] (--dry-run | --apply)');
  console.error(`  --db recebido: ${ALVO} (válidos: ${Object.keys(BANCOS).join(', ')})`);
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv, label: 'onboarding-lote-2026-09/seed' });
console.log(`banco: ${DB_ID}${ALVO === 'prod' ? '  ⚠️ PRODUÇÃO' : ''}\n`);

const schemas = JSON.parse(readFileSync(SCHEMAS, 'utf8'));

const KNOWN_TYPES = ['STRING','INT64','NUMERIC','BIGNUMERIC','FLOAT64','BOOL','DATE','DATETIME','TIMESTAMP','TIME','BYTES','GEOGRAPHY','JSON'];
function normaliza(bqType) {
  const t = String(bqType).toUpperCase();
  if (KNOWN_TYPES.includes(t)) return t;
  if (t.startsWith('NUMERIC')) return 'NUMERIC';
  if (t.startsWith('BIGNUMERIC')) return 'BIGNUMERIC';
  if (t === 'BOOLEAN') return 'BOOL';
  if (t === 'INTEGER') return 'INT64';
  if (t === 'FLOAT') return 'FLOAT64';
  return t;
}

/** Colunas reais de um dataset.tabela, como Map(nome → tipo normalizado). */
function colunasDe(datasetId, tabela) {
  const cols = schemas[datasetId]?.tabelas?.[tabela];
  if (!cols) return null;
  return new Map(cols.map((c) => [c.name, normaliza(c.type)]));
}

/**
 * Divergências de tipo que JÁ ESTÃO documentadas em
 * `docs/documentations/2026-09-04-lote-clientes-play-backtest.md`. Declarar
 * aqui é o que permite o script abortar em divergência NOVA — a lista é a
 * fronteira entre "sabido" e "surpresa".
 */
const DIVERGENCIAS_CONHECIDAS = new Set([
  // O dataset inteiro está em STRING. Contrato declara o tipo semântico.
  ...['brz_backtest'].flatMap((ds) =>
    Object.values(ENTIDADES_BACKTEST).flatMap((e) => e.atributos.map((a) => `${ds}.contratos.${a.id}`)),
  ),
  // Parcialmente em STRING.
  ...Object.values(ENTIDADES_BACKTEST).flatMap((e) =>
    e.atributos.map((a) => `jotanunes_backtest.contratos.${a.id}`),
  ),
  ...ENTIDADES_BACKTEST.pagamentos.atributos.map((a) => `jotanunes_backtest.pagamentos.${a.id}`),
  // Monitor: duas colunas em STRING onde o contrato diz FLOAT64.
  'construtora_sudoeste_monitor.contratos.taxa_pricing',
  'construtora_sudoeste_monitor.contratos.private_area',
  // `data_entrega` declarada DATE; OM entrega TIMESTAMP.
  'om_monitor.contratos.data_entrega',
]);

// ─────────────────────────────────────────────────────────────────────
// Etapa 1 — verificação
// ─────────────────────────────────────────────────────────────────────
const problemas = [];
const avisos = [];

// 1a. Todo atributo novo do liquid-play existe em pelo menos um dataset monitor?
const DATASETS_MONITOR = CLIENTES.flatMap((c) =>
  c.bindings.filter((b) => b.productId === 'liquid-play').map((b) => b.datasetId),
);
for (const [entidade, attrs] of Object.entries(NOVOS_ATRIBUTOS)) {
  for (const a of attrs) {
    if (!a?.id) { problemas.push(`atributo sem id em ${entidade}`); continue; }
    let achado = false;
    for (const ds of DATASETS_MONITOR) {
      const cols = colunasDe(ds, entidade);
      if (!cols?.has(a.id)) continue;
      achado = true;
      const real = cols.get(a.id);
      if (real !== a.type && !DIVERGENCIAS_CONHECIDAS.has(`${ds}.${entidade}.${a.id}`)) {
        problemas.push(`${entidade}.${a.id}: declarado ${a.type}, ${ds} tem ${real}`);
      }
    }
    if (!achado) problemas.push(`${entidade}.${a.id}: declarado mas não existe em nenhum dataset monitor`);
  }
}

// 1b. O contrato backtest cobre EXATAMENTE a união das colunas reais?
for (const [entidade, def] of Object.entries(ENTIDADES_BACKTEST)) {
  const declarados = new Set(def.atributos.map((a) => a.id));
  const reaisCanonicos = new Set();
  const inverso = Object.fromEntries(Object.entries(CAIXA_REAL).map(([k, v]) => [v, k]));
  for (const ds of ['brz_backtest', 'jotanunes_backtest']) {
    const cols = colunasDe(ds, entidade);
    if (!cols) continue;
    for (const nome of cols.keys()) reaisCanonicos.add(inverso[nome] ?? nome);
  }
  for (const r of reaisCanonicos) {
    if (!declarados.has(r)) problemas.push(`backtest/${entidade}: coluna real "${r}" não declarada no contrato`);
  }
  for (const d of declarados) {
    if (!reaisCanonicos.has(d)) problemas.push(`backtest/${entidade}: atributo "${d}" declarado mas inexistente no BigQuery`);
  }
}

// 1c. Ids duplicados dentro de uma entidade.
for (const [nome, lista] of [
  ...Object.entries(NOVOS_ATRIBUTOS).map(([e, a]) => [`liquid-play/${e}`, a]),
  ...Object.entries(ENTIDADES_BACKTEST).map(([e, d]) => [`backtest/${e}`, d.atributos]),
]) {
  const vistos = new Set();
  for (const a of lista) {
    if (vistos.has(a.id)) problemas.push(`${nome}: id duplicado "${a.id}"`);
    vistos.add(a.id);
  }
}

// 1d. Shape mínimo: label e description não-vazios, tipo válido.
for (const [nome, lista] of [
  ...Object.entries(NOVOS_ATRIBUTOS).map(([e, a]) => [`liquid-play/${e}`, a]),
  ...Object.entries(ENTIDADES_BACKTEST).map(([e, d]) => [`backtest/${e}`, d.atributos]),
]) {
  for (const a of lista) {
    if (!a.label) problemas.push(`${nome}.${a.id}: label vazio`);
    if (!a.description || a.description.length < 10) problemas.push(`${nome}.${a.id}: description vazia/curta`);
    if (a.description && a.description.length > 500) problemas.push(`${nome}.${a.id}: description acima de 500 chars`);
    if (!KNOWN_TYPES.includes(a.type)) problemas.push(`${nome}.${a.id}: tipo inválido "${a.type}"`);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(a.id)) problemas.push(`${nome}.${a.id}: id não é SqlIdentifier`);
  }
}

// 1e. Todo dataset declarado nos clientes foi introspectado com sucesso?
for (const c of CLIENTES) {
  for (const b of c.bindings) {
    if (!schemas[b.datasetId]?.ok) problemas.push(`${c.id}: dataset ${b.datasetId} sem introspecção`);
  }
}

console.log('=== verificação ===');
if (problemas.length) {
  console.error(`${problemas.length} problema(s) — nada será gravado:`);
  for (const p of problemas) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('  ok: dicionários conferem com o schema real do BigQuery');
for (const a of avisos) console.log(`  aviso: ${a}`);

// ─────────────────────────────────────────────────────────────────────
// Etapa 2 — plano de escrita
// ─────────────────────────────────────────────────────────────────────
if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);
const agora = Timestamp.now();

/** Métricas que leem o contrato `liquid-play` — viram os metricRefs do produto. */
const metricsSnap = await db.collection('metrics').get();
const METRICAS_PLAY = metricsSnap.docs
  .filter((d) => (d.data().requires ?? []).some((r) => String(r).startsWith('liquid-play.')))
  .map((d) => ({ id: d.id, requires: d.data().requires ?? [] }))
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Métricas que este binding consegue de fato executar.
 *
 * Mesma semântica de `collectBindingGaps` + `resolveColumn`: attribute ausente
 * ou mapeado para `null` faz a métrica falhar. Vale a pena calcular porque
 * `enabledIndicators` é o que o agente de IA enxerga como oferta do cliente
 * (`client-semantic-context.ts`) — deixar `null` ali significa a IA propor um
 * bloco que morre no `resolveColumn`, e o dono do produto lê isso como bug.
 */
function metricasExecutaveis(contractRef, schemaBindings) {
  return METRICAS_PLAY.filter((m) =>
    m.requires.every((ref) => {
      const partes = String(ref).split('.');
      if (partes.length !== 3 || partes[0] !== contractRef) return true; // outro contrato
      return typeof schemaBindings[`${partes[1]}.${partes[2]}`] === 'string';
    }),
  ).map((m) => m.id);
}

const escritas = [];
function planeja(ref, dados, modo = 'merge') {
  escritas.push({ path: ref.path, dados, modo });
}

// 2a. Produtos.
const PRODUTOS = [
  {
    id: 'liquid-play',
    doc: {
      name: 'Liquid Play',
      slug: 'liquid-play',
      icon: 'LineChart',
      color: '#5F9BCA',
      status: 'active',
      description:
        'Monitoramento de carteira de recebíveis imobiliários: saldo, atraso, rating, LTV, PDD e fluxo de caixa por contrato.',
      contractRefs: ['liquid-play'],
      entityRefs: ['contratos', 'fluxo_caixa', 'pagamentos'],
      // `.map(id)` e não `METRICAS_PLAY`: o array carrega `{id, requires}` para
      // calcular `enabledIndicators`, mas `metricRefs` é lista de ID.
      metricRefs: METRICAS_PLAY.map((m) => m.id),
      indicators: [],
      routes: [],
    },
  },
  {
    id: 'backtest',
    doc: {
      name: 'Liquid Backtest',
      slug: 'backtest',
      icon: 'History',
      color: '#96609B',
      status: 'active',
      description:
        'Simulação retrospectiva de carteira: posição financeira e scores de bureau por perfil de backtest.',
      contractRefs: ['backtest'],
      entityRefs: ['contratos', 'pagamentos'],
      // Nenhuma métrica existe para este contrato ainda — ver docs/documentations.
      metricRefs: [],
      indicators: [],
      routes: [],
    },
  },
];
/*
 * Guarda contra a classe de erro que já aconteceu aqui: `metricRefs` recebeu o
 * array `{id, requires}` em vez dos IDs, e gravou 24 objetos. Não quebrou nada
 * de forma visível no seed — o `products` mostrava `metricRefs=24`, contagem
 * certa — mas `useActiveProductMetrics` faz `new Set(metricRefs)` e compara com
 * `m.id`, então o produto Play inteiro ficaria com zero métricas.
 *
 * Referência que deveria ser ID e é objeto é indistinguível de uma contagem
 * correta. Por isso a checagem é sobre o TIPO de cada item, não sobre o tamanho.
 */
for (const p of PRODUTOS) {
  for (const campo of ['contractRefs', 'entityRefs', 'metricRefs']) {
    const v = p.doc[campo];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
      problemas.push(`produto ${p.id}: ${campo} deve ser array de string, veio ${JSON.stringify(v).slice(0, 80)}`);
    }
  }
}
if (problemas.length) {
  console.error('\nproblema no shape dos produtos — nada será gravado:');
  for (const p of problemas) console.error(`  ✗ ${p}`);
  process.exit(1);
}
for (const p of PRODUTOS) {
  const atual = await db.collection('products').doc(p.id).get();
  planeja(db.collection('products').doc(p.id), {
    ...p.doc,
    ...(atual.exists ? {} : { createdAt: agora }),
    updatedAt: agora,
  });
}

/**
 * Grava um atributo do dicionário.
 *
 * ─── Por que não é puramente aditivo ───
 *
 * O seed do Play+ nunca sobrescreve atributo existente, e por bom motivo:
 * clobberar um `type` que alguém consertou à mão, ou uma descrição curada,
 * é estrago silencioso.
 *
 * Mas tratar TEXTO com o mesmo cuidado que TIPO custou caro: uma descrição
 * minha dizia que a coluna de origem de `pagamentos.regional` era `Regional`,
 * quando naquela entidade ela é minúscula — errado, gravado, e imune a
 * correção porque o atributo "já existia". E descrição não é enfeite: é o que
 * alimenta o contexto semântico do agente de IA. Descrição errada é pior que
 * vazia, porque tem autoridade.
 *
 * Então a regra é assimétrica, e de propósito:
 *   - `label`, `description`, `unit` → sempre alinhados ao dicionário. É texto,
 *     o dicionário é a fonte, e errar aqui tem de ser corrigível.
 *   - `type`, `isKey`, `required` → só na criação. Mudança de tipo em contrato
 *     vigente passa por `CORRECOES_DE_TIPO`, que é uma lista revisável.
 */
function planejaAtributo(contractId, entidade, a, contadores) {
  const ref = db.doc(`dataContracts/${contractId}/entities/${entidade}/attributes/${a.id}`);
  return ref.get().then((atual) => {
    const texto = { label: a.label, description: a.description, unit: a.unit ?? null };
    if (atual.exists) {
      const igual =
        atual.data().label === texto.label &&
        atual.data().description === texto.description &&
        (atual.data().unit ?? null) === texto.unit;
      if (igual) { contadores.inalterados++; return; }
      contadores.textoAtualizado++;
      planeja(ref, { ...texto, updatedAt: agora });
      return;
    }
    contadores.novos++;
    planeja(ref, {
      entityId: entidade,
      ...texto,
      type: a.type,
      isKey: a.isKey ?? false,
      required: a.required ?? false,
      deprecated: false,
      deprecatedReason: null,
      createdAt: agora,
      updatedAt: agora,
    });
  });
}

// 2b. Contrato liquid-play.
const contPlay = { novos: 0, textoAtualizado: 0, inalterados: 0 };
for (const [entidade, attrs] of Object.entries(NOVOS_ATRIBUTOS)) {
  for (const a of attrs) await planejaAtributo('liquid-play', entidade, a, contPlay);
}
// 2c. Correção do tipo inválido `FLOAT`.
for (const c of CORRECOES_DE_TIPO) {
  const ref = db.doc(`dataContracts/liquid-play/entities/${c.entidade}/attributes/${c.atributo}`);
  const atual = await ref.get();
  if (atual.exists && atual.data().type === c.de) {
    planeja(ref, { type: c.para, updatedAt: agora });
  }
}

// 2d. Contrato backtest.
const contratoBacktestRef = db.collection('dataContracts').doc('backtest');
const contratoBacktestAtual = await contratoBacktestRef.get();
planeja(contratoBacktestRef, {
  name: 'Liquid Backtest',
  version: '1.0.0',
  status: 'active',
  description:
    'Vocabulário do produto Backtest: contratos e pagamentos do cenário simulado, com scores de bureau. Reaproveita 21 das 96 colunas do contrato do Monitor; as demais são próprias.',
  ...(contratoBacktestAtual.exists ? {} : { createdAt: agora }),
  updatedAt: agora,
});
const contBacktest = { novos: 0, textoAtualizado: 0, inalterados: 0 };
for (const [entidade, def] of Object.entries(ENTIDADES_BACKTEST)) {
  planeja(db.doc(`dataContracts/backtest/entities/${entidade}`), {
    label: def.label,
    description: def.description,
    createdAt: agora,
    updatedAt: agora,
  });
  for (const a of def.atributos) await planejaAtributo('backtest', entidade, a, contBacktest);
}

// 2e. Clientes — schemaBindings derivados do schema real.
/** Vocabulário final de um contrato, depois desta execução. */
async function vocabulario(contractId, entidadesExtra) {
  const out = {};
  const entsSnap = await db.collection(`dataContracts/${contractId}/entities`).get();
  for (const e of entsSnap.docs) {
    const attrs = await db.collection(`dataContracts/${contractId}/entities/${e.id}/attributes`).get();
    out[e.id] = new Set(attrs.docs.map((d) => d.id));
  }
  for (const [ent, ids] of Object.entries(entidadesExtra ?? {})) {
    out[ent] = new Set([...(out[ent] ?? []), ...ids]);
  }
  return out;
}

const VOCAB = {
  'liquid-play': await vocabulario('liquid-play', {
    contratos: NOVOS_ATRIBUTOS.contratos.map((a) => a.id),
    fluxo_caixa: NOVOS_ATRIBUTOS.fluxo_caixa.map((a) => a.id),
    pagamentos: NOVOS_ATRIBUTOS.pagamentos.map((a) => a.id),
  }),
  backtest: await vocabulario('backtest', {
    contratos: ENTIDADES_BACKTEST.contratos.atributos.map((a) => a.id),
    pagamentos: ENTIDADES_BACKTEST.pagamentos.atributos.map((a) => a.id),
  }),
};

const resumoClientes = [];
for (const cliente of CLIENTES) {
  const productBindings = [];
  for (const b of cliente.bindings) {
    const vocab = VOCAB[b.contractRef];
    const schemaBindings = {};
    const tableBindings = {};
    let mapeados = 0;
    let nulos = 0;
    const tabelasAusentes = [];

    for (const [entidade, atributos] of Object.entries(vocab)) {
      const cols = colunasDe(b.datasetId, entidade);
      if (!cols) { tabelasAusentes.push(entidade); continue; }
      tableBindings[entidade] = entidade;
      for (const attr of atributos) {
        // Ordem de resolução: sinônimo declarado do cliente → caixa real do
        // backtest → nome idêntico. `null` = conferido e ausente.
        const sinonimo = SINONIMOS[cliente.id]?.[entidade]?.[attr];
        const caixa = b.contractRef === 'backtest' ? CAIXA_REAL[attr] : undefined;
        const real = [sinonimo, caixa, attr].find((n) => n && cols.has(n));
        schemaBindings[`${entidade}.${attr}`] = real ?? null;
        if (real) mapeados++; else nulos++;
      }
    }
    // `null` quando TODAS as métricas do produto rodam (é o default e diz
    // "sem restrição"); a lista explícita só quando há métrica que não roda.
    const executaveis = b.contractRef === 'liquid-play'
      ? metricasExecutaveis(b.contractRef, schemaBindings)
      : [];
    const totalDoProduto = b.contractRef === 'liquid-play' ? METRICAS_PLAY.length : 0;
    const enabledIndicators =
      b.contractRef === 'liquid-play' && executaveis.length < totalDoProduto ? executaveis : null;

    productBindings.push({
      productId: b.productId,
      datasets: [{
        id: 'main',
        dataSourceId: DATA_SOURCE_ID,
        datasetId: b.datasetId,
        contractRef: b.contractRef,
        schemaBindings,
        tableBindings,
        schema: {},
        lastSchemaSync: agora,
        isPrimary: true,
      }],
      enabledIndicators,
    });
    resumoClientes.push({
      cliente: cliente.id, produto: b.productId, dataset: b.datasetId,
      mapeados, nulos, tabelasAusentes,
      metricas: totalDoProduto ? `${executaveis.length}/${totalDoProduto}` : 'n/a',
      restrito: enabledIndicators !== null,
    });
  }

  const ref = db.collection('clients').doc(cliente.id);
  const atual = await ref.get();
  if (atual.exists) {
    avisos.push(`cliente ${cliente.id} JÁ EXISTE — productBindings serão substituídos`);
  }
  planeja(ref, {
    name: cliente.name,
    initial: cliente.initial,
    color: cliente.color,
    productBindings,
    ...(atual.exists ? {} : { createdAt: agora }),
    updatedAt: agora,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Etapa 3 — resumo e gravação
// ─────────────────────────────────────────────────────────────────────
console.log('\n=== plano ===');
console.log(`  produtos:                 ${PRODUTOS.length} (liquid-play, backtest)`);
console.log(`  métricas no liquid-play:  ${METRICAS_PLAY.length}`);
console.log(`  métricas no backtest:     0 (nenhuma existe — ver docs/documentations)`);
for (const [nome, c] of [['liquid-play', contPlay], ['backtest', contBacktest]]) {
  console.log(
    `  atributos ${nome.padEnd(13)} ${c.novos} novos, ` +
      `${c.textoAtualizado} com texto atualizado, ${c.inalterados} inalterados`,
  );
}
console.log(`  clientes:                 ${CLIENTES.length}`);
console.log(`  documentos a gravar:      ${escritas.length}`);
console.log('\n  bindings por cliente:');
for (const r of resumoClientes) {
  const falta = r.tabelasAusentes.length ? `  tabelas ausentes: ${r.tabelasAusentes.join(',')}` : '';
  const met = r.metricas === 'n/a' ? '' : `  métricas ${r.metricas}${r.restrito ? ' (restrito)' : ''}`;
  console.log(`    ${r.cliente.padEnd(22)} ${r.produto.padEnd(12)} ${r.dataset.padEnd(30)} ${String(r.mapeados).padStart(3)} mapeados, ${String(r.nulos).padStart(3)} nulos${met}${falta}`);
}
for (const a of avisos) console.log(`\n  aviso: ${a}`);

if (DRY_RUN) {
  console.log('\n--dry-run: nada gravado.');
  process.exit(0);
}

console.log('\n=== gravando ===');
let n = 0;
for (let i = 0; i < escritas.length; i += 400) {
  const lote = db.batch();
  for (const w of escritas.slice(i, i + 400)) {
    lote.set(db.doc(w.path), w.dados, { merge: true });
  }
  await lote.commit();
  n += Math.min(400, escritas.length - i);
  console.log(`  ${n}/${escritas.length}`);
}
console.log('ok');
