#!/usr/bin/env tsx

/**
 * Dá série histórica aos KPIs — a "evolução" que o cartão nunca mostrou.
 *
 * ─── O problema ─────────────────────────────────────────────────────────────
 *
 * Os 46 KPIs do Vila Rosa exibem UM número, o do mês escolhido. Nenhum declara
 * `sparklineMetricId`, então nenhum desenha trajetória: o cartão diz "7,00" e
 * não conta que era 12,06 dois meses atrás — uma queda de 42% invisível. O
 * caminho de render existe inteiro e vazio (`SingleKpiBlock` → `KpiCard`), à
 * espera de uma métrica de série.
 *
 * ─── Como as séries nascem ──────────────────────────────────────────────────
 *
 * `kpiMonthlySeries()` traduz o pin de posição na série mensal equivalente. O
 * que ele não reconhece, recusa — e o KPI fica como está hoje.
 *
 * ─── A prova, contra dado real ──────────────────────────────────────────────
 *
 * Gerar SQL plausível é fácil; gerar SQL certo, não. Por isso nada é gravado
 * sem passar num teste que só o dado responde: **o último ponto da série tem de
 * ser igual ao valor que o KPI exibe hoje**. Divergiu, a série é descartada com
 * os dois números no relatório. É o mesmo raciocínio do `EXCEPT DISTINCT` que
 * validou a migração de filtros: a nova consulta prova-se contra a antiga.
 *
 * Série com menos de 2 pontos também é descartada: uma sparkline de um ponto
 * não é trajetória, é um pixel. E valor AUSENTE dos dois lados também reprova —
 * ver `lib/result-number.ts`, onde `Number(null) === 0` já transformou
 * "não tem valor" em "vale zero" e aprovou o que devia recusar.
 *
 * Aditivo e idempotente: a métrica gerada tem id `<id>_sparkline`, e se já
 * existir uma métrica cujo SQL é equivalente ao gerado, ela é REUSADA em vez de
 * duplicada.
 *
 * Usage:
 *   pnpm exec tsx scripts/add-kpi-sparklines.ts --dry-run
 *   pnpm exec tsx scripts/add-kpi-sparklines.ts --apply [--allow-prod]
 *
 * No banco `dataviz` (produção) `--apply` exige `--allow-prod`; `--dry-run`
 * junto com `--apply` é recusado.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BigQuery } from '@google-cloud/bigquery';
import { kpiMonthlySeries } from '../src/shared/lib/metrics/kpi-series';
import { resolveMetric, type PageFilterValue } from '../src/shared/lib/metrics/resolve-metric';
import { resultNumber, sameValue } from './lib/result-number';
import { willWrite } from './lib/migration-mode';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import type { Metric } from '../src/shared/schemas/metric';
import type { ClientDatasetBinding } from '../src/shared/schemas/client-binding';

const DB_ID = process.env.DATAVIZ_DATABASE_ID || '(default)';
// Before any Firestore/BigQuery client exists: a refused run makes no GCP call.
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'add-kpi-sparklines' });
const APPLY = willWrite(process.argv);
const CLIENT = 'vila-rosa';
/** Faixa escancarada: queremos TODOS os meses que o dataset tiver. */
const START = '1900-01-01';
const END = '2999-12-31';

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

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Entidade que a métrica lê — decide qual `attribute` o filtro de data usa. */
function entityOf(template: string): string {
  return /FROM\s+\{([a-z_][a-z0-9_]*)\}/i.exec(template)?.[1] ?? 'contratos';
}

async function run(
  bq: BigQuery,
  metric: Metric,
  binding: ClientDatasetBinding,
  filters: Record<string, PageFilterValue>,
): Promise<Array<Record<string, unknown>>> {
  const r = resolveMetric({
    metric,
    binding,
    projectId: process.env.BIGQUERY_PROJECT_ID,
    pageFilters: filters,
  });
  const [rows] = await bq.query({
    query: r.sql,
    params: r.params,
    location: process.env.BIGQUERY_LOCATION || 'US',
  });
  return rows as Array<Record<string, unknown>>;
}

interface Verdict {
  id: string;
  label: string;
  uses: number;
  status: 'reusa' | 'cria' | 'recusada' | 'divergiu' | 'curta' | 'erro';
  detail: string;
  sparklineId?: string;
  template?: string;
}

async function evaluate(
  bq: BigQuery,
  source: Metric,
  existing: Map<string, Metric>,
  binding: ClientDatasetBinding,
  uses: number,
): Promise<Verdict> {
  const base = { id: source.id, label: source.label ?? source.id, uses };
  if (source.recipe?.kind !== 'sql') {
    return { ...base, status: 'recusada', detail: `recipe ${source.recipe?.kind ?? 'ausente'}` };
  }

  const generated = kpiMonthlySeries(source.recipe.template);
  if (!generated.ok) return { ...base, status: 'recusada', detail: generated.motivo };

  const ent = entityOf(source.recipe.template);
  const candidate: Metric = {
    ...source,
    id: `${source.id}_sparkline`,
    shape: 'timeseries',
    outputColumns: ['bucket', 'value'],
    recipe: { kind: 'sql', template: generated.template },
  } as Metric;

  try {
    const series = await run(bq, candidate, binding, {
      date_range: { kind: 'date_range', start: START, end: END, attribute: `${ent}.data_base_report` },
      ate: { kind: 'ate', value: END, attribute: `${ent}.data_base_report` },
    });
    if (series.length < 2) {
      return { ...base, status: 'curta', detail: `${series.length} ponto(s) — sparkline precisa de trajetória` };
    }

    const doKpi = await run(bq, source, binding, {
      ate: { kind: 'ate', value: END, attribute: `${ent}.data_base_report` },
    });
    const expected = resultNumber(doKpi[0]?.value);
    const actual = resultNumber(series[series.length - 1]?.value);
    if (!sameValue(expected, actual)) {
      return { ...base, status: 'divergiu', detail: `KPI=${expected} × último ponto=${actual}` };
    }

    const reuse = [...existing.values()].find(
      (m) => m.recipe?.kind === 'sql' && norm(m.recipe.template) === norm(generated.template),
    );
    if (reuse) {
      return { ...base, status: 'reusa', detail: `${series.length} pontos`, sparklineId: reuse.id };
    }
    return {
      ...base, status: 'cria', detail: `${series.length} pontos`,
      sparklineId: candidate.id, template: generated.template,
    };
  } catch (err) {
    return { ...base, status: 'erro', detail: (err as Error).message.split('\n')[0].slice(0, 160) };
  }
}

async function main() {
  const fs = db();
  const bq = new BigQuery({ projectId: process.env.BIGQUERY_PROJECT_ID });

  const metrics = new Map<string, Metric>(
    (await fs.collection('metrics').get()).docs.map((d) => [d.id, { id: d.id, ...d.data() } as Metric]),
  );
  const client = (await fs.collection('clients').doc(CLIENT).get()).data();
  const datasets = (client?.productBindings ?? []).flatMap(
    (pb: { datasets?: ClientDatasetBinding[] }) => pb.datasets ?? [],
  ) as ClientDatasetBinding[];

  /** Onde cada KPI aparece — e por qual dataset ele é atendido. */
  const uses = new Map<string, { n: number; blocks: Array<{ grupo: string; report: string; block: string }> }>();
  for (const g of (await fs.collection(`clients/${CLIENT}/groups`).get()).docs) {
    for (const r of (await fs.collection(`clients/${CLIENT}/groups/${g.id}/reports`).get()).docs) {
      for (const [bid, b] of Object.entries(r.data().blockMap ?? {})) {
        const block = b as { type?: string; metricId?: string; sparklineMetricId?: string };
        if (block.type !== 'kpi' || !block.metricId) continue;
        const e = uses.get(block.metricId) ?? { n: 0, blocks: [] };
        e.n++;
        e.blocks.push({ grupo: g.id, report: r.id, block: bid });
        uses.set(block.metricId, e);
      }
    }
  }

  const bindingDe = (m: Metric) => {
    const ent = entityOf(m.recipe?.kind === 'sql' ? m.recipe.template : '');
    return datasets.find((d) => Object.keys(d.schemaBindings ?? {}).some((k) => k.startsWith(`${ent}.`)));
  };

  const verdicts: Verdict[] = [];
  for (const [id, usage] of [...uses].sort()) {
    const source = metrics.get(id);
    if (!source) {
      verdicts.push({ id, label: id, uses: usage.n, status: 'erro', detail: 'métrica não existe' });
      continue;
    }
    const binding = bindingDe(source);
    if (!binding) {
      verdicts.push({ id, label: source.label ?? id, uses: usage.n, status: 'erro', detail: 'sem binding' });
      continue;
    }
    verdicts.push(await evaluate(bq, source, metrics, binding, usage.n));
  }

  const width = Math.max(...verdicts.map((v) => v.id.length));
  console.log(`\ndatabase: ${DB_ID} | modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  for (const v of verdicts.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id))) {
    const destino = v.sparklineId ? ` → ${v.sparklineId}` : '';
    console.log(`${v.status.padEnd(9)} ${v.id.padEnd(width)} (${v.uses}×) ${v.detail}${destino}`);
  }
  const count = verdicts.reduce<Record<string, number>>((a, v) => {
    a[v.status] = (a[v.status] ?? 0) + 1;
    return a;
  }, {});
  console.log('\nresumo:', JSON.stringify(count));

  const applicable = verdicts.filter((v) => v.sparklineId);
  console.log(`KPIs que ganham sparkline: ${applicable.reduce((a, v) => a + v.uses, 0)} blocos, ${applicable.length} métricas`);

  if (!APPLY) {
    console.log('\n(dry-run — nada gravado)');
    return;
  }

  let savedMetrics = 0;
  let savedBlocks = 0;
  for (const v of applicable) {
    const source = metrics.get(v.id)!;
    if (v.status === 'cria') {
      await fs.collection('metrics').doc(v.sparklineId!).set({
        label: `${source.label ?? v.id} — Série`,
        description: `Série mensal de "${source.label ?? v.id}", usada como sparkline do KPI.`,
        type: 'chart',
        category: null,
        unit: source.unit ?? null,
        requires: source.requires ?? [],
        recipe: { kind: 'sql', template: v.template },
        shape: 'timeseries',
        outputColumns: ['bucket', 'value'],
        version: '1.0.0',
        status: 'active',
        ownerClientId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
      savedMetrics++;
    }

    for (const target of uses.get(v.id)!.blocks) {
      const ref = fs.doc(`clients/${CLIENT}/groups/${target.grupo}/reports/${target.report}`);
      const snap = await ref.get();
      const blockMap = (snap.data()?.blockMap ?? {}) as Record<string, Record<string, unknown>>;
      const block = blockMap[target.block];
      // Bloco que já aponta para alguma série fica como está: a escolha de
      // quem editou o relatório vence a deste script.
      if (!block || block.sparklineMetricId) continue;
      block.sparklineMetricId = v.sparklineId;
      await ref.update({ blockMap });
      savedBlocks++;
    }
  }
  console.log(`\ngravado: ${savedMetrics} métricas de série, ${savedBlocks} blocos apontados`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
