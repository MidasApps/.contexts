#!/usr/bin/env node

/**
 * Migra as métricas de `transacoes` para o filtro sobre o campo do indicador
 * (ADR-0026), e conserta os filtros de página que apontavam para a coluna crua.
 *
 * ─── O que muda ─────────────────────────────────────────────────────────────
 *
 * Os pins `{filter.banco:transacoes.banco_codigo}` e
 * `{filter.categoria:transacoes.categoria}` saem; entram `{filter.banco}` /
 * `{filter.categoria}` e a declaração `filterFields`, que diz o que a métrica
 * compara e qual coluna do resultado exibe aquele valor.
 *
 * O efeito é o pedido que originou a ADR: o seletor passa a oferecer
 * "BANCO INTER" (o que a tela mostra) em vez de `77`, e "Impostos" em vez de
 * "Tax on financial operations".
 *
 * ─── Por que três métricas ganham JOIN ──────────────────────────────────────
 *
 * Uma chave de filtro tem UM domínio. Se a tabela comparasse nome e o gráfico
 * ao lado comparasse código, escolher "BANCO INTER" zeraria o gráfico. Então
 * quem participa da chave precisa enxergar a mesma coluna.
 *
 * ─── Por que o JOIN novo é deduplicado ──────────────────────────────────────
 *
 * Medido antes de escrever isto: `ba_bancos` tem 478 linhas para 468
 * `numero_codigo` distintos, e `ba_pluggy_categorias` tem 137 para 135
 * `description`. Chave repetida em LEFT JOIN multiplica a linha da esquerda —
 * numa métrica que soma, isso dobra o número em silêncio. No dado de hoje do
 * Vila Rosa o join não multiplica (418 → 418), mas isso é sorte do dado, não
 * garantia do schema. Por isso as métricas que AGREGAM juntam
 * `(SELECT chave, ANY_VALUE(rotulo) … GROUP BY chave)`, que é 1:1 por
 * construção. `extrato_table` fica com o join que já tinha: é métrica de
 * linhas, e mudar a forma dela está fora desta migração.
 *
 * Aditivo e idempotente: métrica que já tem `filterFields` e template sem pin
 * é pulada; re-execução não grava nada.
 *
 * ⚠️ `covenants.transacoes_por_tipo_serie` é reescrita INTEIRA aqui, sem
 * cláusula de data. Quem a devolve é `patch-period-blind-metrics.ts`
 * (ADR-0027), que roda depois. Se `covenants-v2.mjs` for re-semeado, o pin
 * volta, a guarda deste script deixa de pular — e os dois precisam rodar de
 * novo, nesta ordem, senão a série volta a ignorar o período escolhido.
 *
 * Usage:
 *   node scripts/patch-covenants-filter-fields.mjs --dry-run
 *   node scripts/patch-covenants-filter-fields.mjs --apply [--allow-prod]
 *
 * O banco vem de `DATAVIZ_DATABASE_ID` — o mesmo env que o app usa. Confira
 * antes de rodar com `--apply`. No banco `dataviz` (produção) `--apply` exige
 * `--allow-prod`; `--dry-run` junto com `--apply` é recusado.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const DB_ID = process.env.DATAVIZ_DATABASE_ID || '(default)';
// Before any Firestore client exists: a refused run makes no GCP call.
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'patch-covenants-filter-fields' });
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

const BQ_PROJECT = process.env.BIGQUERY_PROJECT_ID || 'YOUR_BQ_PROJECT';
const BANKS_DEDUP =
  '(SELECT numero_codigo, ANY_VALUE(nome_reduzido) AS nome_reduzido '
  + `FROM \`${BQ_PROJECT}.dataviz_aux.ba_bancos\` GROUP BY numero_codigo)`;
const CATEGORIES_DEDUP =
  '(SELECT description, ANY_VALUE(parent_description_translated) AS parent_description_translated '
  + `FROM \`${BQ_PROJECT}.dataviz_aux.ba_pluggy_categorias\` GROUP BY description)`;

const CATEGORY_EXPR = 'COALESCE(cat.parent_description_translated, t.{transacoes.categoria})';

/** Métrica de linhas: já traz os dois JOINs e exibe os dois campos. */
const STATEMENT = {
  id: 'covenants.extrato_table',
  filterFields: {
    banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
    categoria: { expr: CATEGORY_EXPR, field: 'categoria', label: 'Categoria' },
    tipo: { expr: 't.{transacoes.tipo}', field: 'tipo', label: 'Tipo' },
  },
  template: (t) => t
    .replace('{filter.banco:transacoes.banco_codigo}', '{filter.banco}')
    .replace('{filter.categoria:transacoes.categoria}', '{filter.categoria}')
    .replace('{filter.tipo:transacoes.tipo}', '{filter.tipo}'),
};

/** Breakdown por categoria: exibe `categoria`, e obedece ao banco sem exibi-lo. */
const byCategory = (id) => ({
  id,
  filterFields: {
    banco: { expr: 'b.nome_reduzido', label: 'Banco' },
    categoria: { expr: CATEGORY_EXPR, field: 'categoria', label: 'Categoria' },
  },
  template: (t) => t
    .replace(
      'FROM {transacoes} t',
      `FROM {transacoes} t\n      LEFT JOIN ${BANKS_DEDUP} b\n        ON t.{transacoes.banco_codigo} = b.numero_codigo`,
    )
    .replace('{filter.banco:transacoes.banco_codigo}', '{filter.banco}')
    .replace('{filter.categoria:transacoes.categoria}', '{filter.categoria}'),
});

/**
 * Série por tipo: não exibe banco nem categoria, e não tinha JOIN nenhum.
 *
 * O template é reescrito inteiro porque ele lia as colunas SEM alias
 * (`{transacoes.tipo}`), e com dois JOINs na consulta uma referência sem
 * qualificação vira ambiguidade na hora que a lookup tiver coluna de mesmo
 * nome.
 */
const SERIES = {
  id: 'covenants.transacoes_por_tipo_serie',
  filterFields: {
    banco: { expr: 'b.nome_reduzido', label: 'Banco' },
    categoria: { expr: CATEGORY_EXPR, label: 'Categoria' },
  },
  template: () =>
    'SELECT DATE_TRUNC(t.{transacoes.data}, MONTH) AS bucket,\n'
    + "             SUM(IF(UPPER(t.{transacoes.tipo}) = 'CREDIT', t.{transacoes.valor}, 0)) AS credit,\n"
    + "             SUM(IF(UPPER(t.{transacoes.tipo}) = 'DEBIT', t.{transacoes.valor}, 0)) AS debit\n"
    + '      FROM {transacoes} t\n'
    + `      LEFT JOIN ${BANKS_DEDUP} b\n`
    + '        ON t.{transacoes.banco_codigo} = b.numero_codigo\n'
    + `      LEFT JOIN ${CATEGORIES_DEDUP} cat\n`
    + '        ON t.{transacoes.categoria} = cat.description\n'
    + '      WHERE {filter.banco}\n'
    + '        AND {filter.categoria}\n'
    + '      GROUP BY bucket\n'
    + '      ORDER BY bucket',
};

const METRICS = [
  STATEMENT,
  byCategory('covenants.saidas_por_categoria'),
  byCategory('covenants.entradas_por_categoria'),
  SERIES,
];

/**
 * Filtros de página já gravados que apontam para a coluna crua.
 *
 * Sem isto o seletor de Banco do Extrato Detalhado quebraria de vez: ele guarda
 * o código (`77`) e a métrica passa a comparar o nome — a tabela viria vazia,
 * com cara de "não há lançamento".
 */
const FIELD_BY_KEY = {
  banco: { metricId: 'covenants.extrato_table', field: 'banco', label: 'Banco' },
  categoria: { metricId: 'covenants.extrato_table', field: 'categoria', label: 'Categoria' },
  tipo: { metricId: 'covenants.extrato_table', field: 'tipo', label: 'Tipo' },
};

function db() {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
  }
  return getFirestore(DB_ID);
}

async function migrateMetrics(firestore) {
  const summary = { written: [], skipped: [], missing: [] };

  for (const target of METRICS) {
    const ref = firestore.collection('metrics').doc(target.id);
    const snap = await ref.get();
    if (!snap.exists) {
      summary.missing.push(target.id);
      continue;
    }
    const data = snap.data();
    const current = data?.recipe?.template;
    if (typeof current !== 'string') {
      summary.missing.push(`${target.id} (sem template sql)`);
      continue;
    }

    /*
     * Já migrada = tem `filterFields` E não sobrou pin das chaves que este
     * script cuida.
     *
     * Comparar `novo === atual` NÃO serve: a inserção do JOIN casa
     * `FROM {transacoes} t`, que continua lá depois da migração — a segunda
     * execução enfiaria um segundo `LEFT JOIN … b`, e a métrica quebraria com
     * alias duplicado. Verificado com --dry-run logo após o primeiro --apply.
     */
    const updated = target.template(current);
    const stillHasPin = /\{filter\.(banco|categoria|tipo):/.test(current);
    if (Boolean(data.filterFields) && !stillHasPin) {
      summary.skipped.push(target.id);
      continue;
    }

    console.log(`\n── ${target.id} ──`);
    console.log('filterFields:', JSON.stringify(target.filterFields, null, 1));
    if (updated !== current) console.log('template:\n' + updated);

    if (!DRY_RUN) {
      await ref.update({
        'recipe.template': updated,
        filterFields: target.filterFields,
        updatedAt: new Date(),
      });
    }
    summary.written.push(target.id);
  }
  return summary;
}

async function migratePageFilters(firestore) {
  const summary = { rewritten: [], untouched: [] };
  const clients = await firestore.collection('clients').get();

  for (const client of clients.docs) {
    const grupos = await client.ref.collection('groups').get();
    for (const grupo of grupos.docs) {
      const reports = await grupo.ref.collection('reports').get();
      for (const report of reports.docs) {
        const declared = report.data()?.filters?.metricPageFilters ?? {};
        const patch = {};

        for (const [key, cfg] of Object.entries(declared)) {
          if (cfg?.control !== 'dropdown') continue;
          if (cfg.source) { summary.untouched.push(`${report.id}/${key}`); continue; }
          const destino = FIELD_BY_KEY[key];
          if (!destino) { summary.untouched.push(`${report.id}/${key} (sem campo equivalente)`); continue; }

          patch[`filters.metricPageFilters.${key}`] = {
            kind: 'in',
            control: 'dropdown',
            label: cfg.label ?? destino.label,
            source: { metricId: destino.metricId, field: destino.field },
          };
          summary.rewritten.push(`${client.id}/${grupo.id}/${report.id}/${key}`);
        }

        if (Object.keys(patch).length > 0) {
          console.log(`\n── ${client.id}/${grupo.id}/${report.id} ──`);
          console.log(JSON.stringify(patch, null, 1));
          if (!DRY_RUN) await report.ref.update(patch);
        }
      }
    }
  }
  return summary;
}

async function main() {
  const firestore = db();
  console.log(`database: ${DB_ID} | modo: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  const metrics = await migrateMetrics(firestore);
  const filters = await migratePageFilters(firestore);

  console.log('\n════ resumo ════');
  console.log('métricas gravadas:', metrics.written.join(', ') || '—');
  console.log('métricas já migradas:', metrics.skipped.join(', ') || '—');
  console.log('métricas ausentes:', metrics.missing.join(', ') || '—');
  console.log('filtros de página reescritos:', filters.rewritten.join(', ') || '—');
  console.log('filtros de página intactos:', filters.untouched.join(', ') || '—');
  if (DRY_RUN) console.log('\nNada foi gravado. Rode com --apply para valer.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
