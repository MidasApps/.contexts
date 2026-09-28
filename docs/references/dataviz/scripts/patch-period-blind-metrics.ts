#!/usr/bin/env tsx

/**
 * Dá cláusula de data às três métricas que ignoravam o período por completo.
 *
 * ─── Quem são ───────────────────────────────────────────────────────────────
 *
 * De 66 métricas do catálogo — a contagem de ANTES das séries que a ADR-0027
 * gera; não a use como número corrente —, 7 não tinham cláusula de data. Quatro
 * delas estão certas assim: VGV, Total de Unidades, Previsão de Entrega e Valor
 * Contratado saem de `ficha_cadastral`, que tem UMA linha e nenhuma coluna de
 * data — são fatos do projeto, não medições mensais.
 *
 * As outras três são defeito, e aparecem em 5 blocos:
 *
 * - `transacoes_por_tipo_serie` (Entradas & Saídas por Mês, 2 blocos): série
 *   mensal de transações sem filtro. O usuário escolhe mai–jul e vê mar–ago.
 *   Os dois vizinhos de página (`entradas_por_categoria`, `saidas_por_categoria`)
 *   já recortam por `{filter.date_range:transacoes.data_base_report}`; esta
 *   passa a recortar igual. Medido: em `transacoes`, cada linha cai dentro do
 *   mês do próprio `data_base_report`, então recortar por ele é recortar pela
 *   data do lançamento.
 *
 * - `velocidade_venda` (2 blocos) e `unidades_vendidas_acum` (1 na página
 *   Unidades): curvas de vendas por `data_emissao`, desde out/2024. Aqui
 *   recortar a EMISSÃO seria destruir a curva — a pergunta é histórica. O que
 *   faltava é a outra metade: de QUAL fotografia da carteira a curva é lida.
 *   Sem pin, `SELECT DISTINCT` unia os três snapshots. Com pin, a curva passa a
 *   ser "as vendas como se sabia em <mês escolhido>" — o mesmo regime dos
 *   outros 45 indicadores.
 *
 * ─── Por que é seguro ───────────────────────────────────────────────────────
 *
 * Com o período escancarado (o default da página), o resultado tem de ser
 * IDÊNTICO ao de hoje: o recorte cobre tudo, e o pin cai no último snapshot,
 * que é superset dos anteriores (medido: 188 contratos na união dos três
 * snapshots, 188 só no de julho). A diferença aparece exatamente quando alguém
 * recorta — que é quando ela deve aparecer.
 *
 * Este script PROVA isso antes de gravar: roda a consulta velha e a nova com o
 * período aberto e compara linha a linha. Divergiu, não grava.
 *
 * ─── Ordem em relação à ADR-0026 ────────────────────────────────────────────
 *
 * Roda DEPOIS de `patch-covenants-filter-fields.mjs`. O patch da série procura
 * `WHERE {filter.banco}`, que só existe depois que aquele script troca o pin
 * `{filter.banco:transacoes.banco_codigo}` — antes dele o casamento falha e a
 * linha sai como `ERRO … o patch não casou` (falha barulhenta, não gravação
 * errada). E se um dia `covenants-v2.mjs` for re-semeado, os dois precisam
 * rodar de novo NESTA ordem: o `.mjs` reescreve a série inteira, sem cláusula
 * de data, e é este script que a devolve.
 *
 * Usage:
 *   pnpm exec tsx scripts/patch-metricas-cegas-ao-periodo.ts --dry-run
 *   pnpm exec tsx scripts/patch-metricas-cegas-ao-periodo.ts --apply [--allow-prod]
 *
 * No banco `dataviz` (produção) `--apply` exige `--allow-prod`; `--dry-run`
 * junto com `--apply` é recusado.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BigQuery } from '@google-cloud/bigquery';
import { resolveMetric, type PageFilterValue } from '../src/shared/lib/metrics/resolve-metric';
import { willWrite } from './lib/migration-mode';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import type { Metric } from '../src/shared/schemas/metric';
import type { ClientDatasetBinding } from '../src/shared/schemas/client-binding';

const DB_ID = process.env.DATAVIZ_DATABASE_ID || '(default)';
// Before any Firestore/BigQuery client exists: a refused run makes no GCP call.
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'patch-metricas-cegas-ao-periodo' });
const APPLY = willWrite(process.argv);
const CLIENT = 'vila-rosa';
const START = '1900-01-01';
const END = '2999-12-31';

/** O pin de posição, na forma que `pinClause()` escreve. */
const pin = (ent: string) =>
  `{${ent}.data_base_report} = (SELECT MAX({${ent}.data_base_report}) `
  + `FROM {${ent}} WHERE {filter.ate:${ent}.data_base_report})`;

interface Patch {
  id: string;
  entity: string;
  reason: string;
  apply: (t: string) => string;
  /** Já migrada? Evita reescrever e evita duplicar cláusula. */
  alreadyHas: (t: string) => boolean;
}

const PATCHES: Patch[] = [
  {
    id: 'covenants.transacoes_por_tipo_serie',
    entity: 'transacoes',
    reason: 'série mensal de transações sem filtro de data',
    alreadyHas: (t) => t.includes('{filter.date_range'),
    apply: (t) => t.replace(
      'WHERE {filter.banco}',
      'WHERE {filter.date_range:transacoes.data_base_report}\n        AND {filter.banco}',
    ),
  },
  {
    id: 'covenants.velocidade_venda',
    entity: 'contratos',
    reason: 'curva de vendas lida da união de todos os snapshots',
    alreadyHas: (t) => t.includes('{filter.ate'),
    apply: (t) => t.replace(
      'FROM {contratos}\n      )',
      `FROM {contratos}\n        WHERE ${pin('contratos')}\n      )`,
    ),
  },
  {
    id: 'covenants.unidades_vendidas_acum',
    entity: 'contratos',
    reason: 'curva acumulada lida da união de todos os snapshots',
    alreadyHas: (t) => t.includes('{filter.ate'),
    apply: (t) => t.replace(
      'FROM {contratos}\n      ),',
      `FROM {contratos}\n        WHERE ${pin('contratos')}\n      ),`,
    ),
  },
];

function db(): Firestore {
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

async function run(
  bq: BigQuery,
  metric: Metric,
  binding: ClientDatasetBinding,
  ent: string,
): Promise<string> {
  const filters: Record<string, PageFilterValue> = {
    date_range: { kind: 'date_range', start: START, end: END, attribute: `${ent}.data_base_report` },
    ate: { kind: 'ate', value: END, attribute: `${ent}.data_base_report` },
    banco: { kind: 'in', values: [] },
    categoria: { kind: 'in', values: [] },
  };
  const r = resolveMetric({
    metric, binding, projectId: process.env.BIGQUERY_PROJECT_ID, pageFilters: filters,
  });
  const [rows] = await bq.query({
    query: r.sql, params: r.params, location: process.env.BIGQUERY_LOCATION || 'US',
  });
  return JSON.stringify(rows);
}

async function main() {
  const fs = db();
  const bq = new BigQuery({ projectId: process.env.BIGQUERY_PROJECT_ID });
  const client = (await fs.collection('clients').doc(CLIENT).get()).data();
  const datasets = (client?.productBindings ?? []).flatMap(
    (pb: { datasets?: ClientDatasetBinding[] }) => pb.datasets ?? [],
  ) as ClientDatasetBinding[];

  console.log(`\ndatabase: ${DB_ID} | modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  const write: Array<{ id: string; template: string }> = [];

  for (const p of PATCHES) {
    const snap = await fs.collection('metrics').doc(p.id).get();
    const doc = snap.data();
    if (!doc) { console.log(`ausente   ${p.id}`); continue; }

    const current = doc.recipe?.template as string | undefined;
    // Sem template não há o que casar — e `jaTem(undefined)` estouraria com um
    // stack trace em vez de dizer qual métrica está torta.
    if (typeof current !== 'string') { console.log(`ERRO      ${p.id} — sem template sql`); continue; }
    if (p.alreadyHas(current)) { console.log(`pulada    ${p.id} — já tem cláusula de data`); continue; }

    const updated = p.apply(current);
    if (updated === current) { console.log(`ERRO      ${p.id} — o patch não casou com o template`); continue; }

    const binding = datasets.find((d) =>
      Object.keys(d.schemaBindings ?? {}).some((k) => k.startsWith(`${p.entity}.`)));
    if (!binding) { console.log(`ERRO      ${p.id} — sem binding para ${p.entity}`); continue; }

    const base = { id: p.id, ...doc } as Metric;
    const before = await run(bq, base, binding, p.entity);
    const after = await run(
      bq, { ...base, recipe: { kind: 'sql', template: updated } } as Metric, binding, p.entity,
    );
    if (before !== after) {
      console.log(`DIVERGIU  ${p.id} — com período aberto o resultado mudou; NÃO gravando`);
      console.log(`  antes:  ${before.slice(0, 200)}`);
      console.log(`  depois: ${after.slice(0, 200)}`);
      continue;
    }
    console.log(`ok        ${p.id} — ${p.reason}; idêntica com período aberto`);
    write.push({ id: p.id, template: updated });
  }

  if (!APPLY) { console.log('\n(dry-run — nada gravado)'); return; }
  for (const g of write) {
    await fs.collection('metrics').doc(g.id).update({
      'recipe.template': g.template,
      updatedAt: new Date(),
    });
  }
  console.log(`\ngravado: ${write.length} métricas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
