'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useActiveDataset } from './useActiveClient';
import { useActiveProduct } from './useActiveProduct';
import { useAppStore } from '@/shared/stores/app-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';
import type {
  CanvasBlock,
  SingleKpiBlock,
  ChartBlock,
  TableBlock,
  CanvasPageFilters,
} from '@/shared/config/agents/types';
import { formatCurrency, formatPercent, formatNumber, formatIsoDate } from '@/shared/lib/format';
import { unwrapCell } from '@/shared/lib/bigquery/cell';
import { acceptsSingleMonthTrim, followsPeriodEnd } from '@/shared/lib/metrics/period-sensitivity';
import { normalizePercentScale } from '@/shared/lib/metrics/percent-scale';
import { materializedData } from '@/shared/lib/report/block-data';
import { supportsComparison } from '@/shared/config/agents/comparison';
import type { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';

/**
 * Pipeline única: cada bloco com `metricId` busca via `/api/metrics/[id]/data`
 * que resolve metric.recipe → DataContract → ClientBinding → BigQuery.
 *
 * Sparkline opcional via `sparklineMetricId` no bloco KPI (mesma pipeline,
 * metric retornando série temporal).
 */

/**
 * O "período" de quem não tem período.
 *
 * As datas são absurdas de propósito: o resolver monta `BETWEEN start AND end`
 * no SQL, então não existe "sem cláusula" — existe cláusula que não exclui
 * nada. Deixar a data final no futuro distante é o que permite a uma projeção
 * até 2027 (ou 2030) atravessar inteira.
 */
const OPEN_PERIOD = { start: '1900-01-01', end: '2999-12-31' } as const;

export function formatValue(
  value: number,
  format?: 'number' | 'currency' | 'percent',
  decimals?: number,
  suffix?: string,
): string {
  let out: string;
  switch (format) {
    case 'currency':
      // currency ignora decimals — formatCurrency já tem regra própria de casas.
      out = formatCurrency(value);
      break;
    case 'percent':
      // Catálogo emite razão 0–1; ×100 na fronteira de apresentação (Fase R/B2).
      out = formatPercent(value * 100, decimals);
      break;
    case 'number':
      out = formatNumber(value, decimals);
      break;
    default:
      return String(value);
  }
  return suffix ? `${out}${suffix}` : out;
}

export interface ReportDataResult {
  populatedBlockMap: Record<string, CanvasBlock> | null;
  loading: boolean;
  error: string | null;
  errorsByMetric: Record<string, string>;
  /**
   * Primeira carga pendente: o report declara métricas e ainda não existe
   * resposta correspondente a ESTES blocos. Quem renderiza mostra esqueleto —
   * nunca o valor que veio do template.
   */
  awaitingFirstData: boolean;
}

/**
 * O mapa já populado descreve os MESMOS blocos que o caller acabou de passar?
 *
 * `populatedBlockMap` é estado e sobrevive à troca de report: o App Router não
 * remonta a página quando só os params mudam. Sem esta checagem, abrir a
 * página B renderizava com o mapa populado da página A — e ids colidem entre
 * templates (`donut-recebiveis` existe na Visão Executiva E em Recebíveis),
 * então o bloco homônimo aparecia com o número da página anterior enquanto o
 * resto da página ficava em branco.
 */
/** Ids dos blocos que dependem de busca — os únicos que o dado precisa cobrir. */
function idsWithData(blockMap: Record<string, CanvasBlock>): string[] {
  return Object.entries(blockMap)
    .filter(([, b]) => Boolean(b.metricId) || Boolean((b as SingleKpiBlock).sparklineMetricId))
    .map(([id]) => id);
}

/**
 * O dado em mãos descreve os blocos DE DADO deste relatório?
 *
 * Comparava a contagem de TODAS as chaves, e isso congelava a página inteira
 * quando entrava um bloco SEM métrica — um cabeçalho de texto, por exemplo.
 * `populatedBlockMap` é um clone do `blockMap` do instante do fetch, então o
 * texto novo não estava lá: a contagem divergia, o mapa era descartado como "de
 * outro relatório", `awaitingFirstData` virava `true` e tudo caía para
 * esqueleto. E não se recuperava, porque texto não acrescenta métrica — o
 * `cacheKey` ficava igual e a busca nunca refazia.
 *
 * Bloco sem métrica não tem o que buscar, logo não tem como invalidar dado já
 * buscado. Bloco de dado NOVO continua invalidando, e aí o `cacheKey` muda
 * junto e a busca acontece.
 */
export function describesSameBlocks(
  populated: Record<string, CanvasBlock> | null,
  blockMap: Record<string, CanvasBlock> | undefined,
): boolean {
  if (!populated || !blockMap) return false;
  const withData = idsWithData(blockMap);
  if (withData.length === 0) return false;
  return withData.every((key) => key in populated);
}

/**
 * Mescla o dado buscado no `blockMap` ATUAL.
 *
 * A tela renderiza este resultado, e o mapa populado é o retrato do instante do
 * fetch — devolvê-lo cru apagaria da página todo bloco criado depois dele.
 * Configuração vem sempre do mapa atual (quem renomeou um rótulo não pode ver o
 * antigo voltar junto com o número); só os campos de dado vêm do populado.
 */
export function mergeDataIntoMap(
  blockMap: Record<string, CanvasBlock>,
  populated: Record<string, CanvasBlock> | null,
): Record<string, CanvasBlock> {
  if (!populated) return blockMap;
  const output: Record<string, CanvasBlock> = {};
  for (const [id, block] of Object.entries(blockMap)) {
    const populatedBlock = populated[id];
    const data = populatedBlock ? materializedData(populatedBlock) : {};
    output[id] = Object.keys(data).length > 0 ? ({ ...block, ...data } as CanvasBlock) : block;
  }
  return output;
}

/**
 * Extrai, do resultado do batch (`{ [metricId]: { ok, error } }`), o mapa de
 * mensagens de erro por métrica que falhou. Métricas `ok: true` são omitidas.
 * Usada por `fetchMetricsBatch` para não silenciar a falha por-métrica
 * (a2-metricas-02) — o bloco correspondente continua com `rows: []`, mas o
 * hook agora expõe o erro para o renderizador desenhar o `GhostBlock` de erro.
 */
export function collectMetricErrors(
  results: Record<string, { ok: boolean; data?: unknown[]; error?: string }>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [id, r] of Object.entries(results)) {
    if (!r?.ok) errors[id] = r?.error ?? 'Falha ao carregar métrica';
  }
  return errors;
}

/**
 * O token da requisição — UMA vez por atualização, não uma por lote.
 *
 * Vivia dentro de `fetchMetricsBatch`, com dois `import()` dinâmicos e uma ida
 * ao Firebase a cada chamada. Enquanto havia exatamente um lote por
 * atualização isso passava despercebido; com a partição por modo e a segunda
 * consulta do comparativo passaram a ser até quatro, concorrentes — e o
 * trabalho repetido não era o pior: a corrida entre os `import()` derrubava
 * chamadas com "Not authenticated" enquanto a irmã, idêntica, passava.
 */
async function getToken(): Promise<string> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const externalToken = getExternalToken();
  const token = externalToken ?? (await getFirebaseAuth().currentUser?.getIdToken());
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function fetchMetricsBatch(
  metricIds: string[],
  clientId: string,
  productId: string | undefined,
  pageFilters: Record<string, unknown>,
  ambientFilters: AmbientFilter[],
  token: string,
): Promise<{ map: Map<string, Array<Record<string, unknown>>>; errorsByMetric: Record<string, string> }> {
  const res = await fetch('/api/metrics/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clientId, productId, metricIds, pageFilters, ambientFilters }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao buscar métricas');
  }
  const body = await res.json();
  const results = (body.results ?? {}) as Record<
    string,
    { ok: boolean; data?: Array<Record<string, unknown>>; error?: string }
  >;
  const map = new Map<string, Array<Record<string, unknown>>>();
  for (const id of metricIds) {
    const r = results[id];
    if (r?.ok) {
      map.set(id, r.data ?? []);
    } else {
      // Falha por-métrica não derruba a página: rows vazias + log (comportamento atual).
      console.error(`[useReportData] Metric "${id}" failed:`, r?.error ?? 'sem resultado');
      map.set(id, []);
    }
  }
  return { map, errorsByMetric: collectMetricErrors(results) };
}

/**
 * O número da célula, ou `null` — nunca `NaN`, que se propaga em silêncio.
 *
 * `unwrapCell` primeiro: DATE, DATETIME, TIMESTAMP e TIME não chegam
 * como primitivo, e `Number({ value: '2026-01-01' })` é `NaN`. Cada bloco vinha
 * reimplementando esse desembrulho inline, e cada reimplementação tratava um
 * subconjunto diferente dos casos.
 */
function cellNumber(v: unknown): number | null {
  const raw = unwrapCell(v);
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * O texto da célula, ou `''` quando não há o que exibir.
 *
 * Objeto que sobrevive ao desembrulho (um STRUCT) também vira `''`: ele vira
 * rótulo de fatia, de etapa, de linha da matriz — e `String()` sobre ele
 * escreveria `[object Object]` no meio do gráfico.
 */
function cellText(v: unknown): string {
  const raw = unwrapCell(v);
  if (raw === null || raw === undefined || typeof raw === 'object') return '';
  return String(raw);
}

/**
 * O texto de um indicador cujo valor não é número.
 *
 * Três casos reais, todos no grupo de covenants do Vila Rosa: "Data Consulta",
 * "Previsão de Entrega" e "Data da Medição" são KPIs de DATE. Sem formato
 * declarado, o cartão mostrava a data ISO crua na melhor das hipóteses — e
 * `[object Object]` na prática, porque a célula vinha embrulhada.
 *
 * O que sobrar de objeto vira o traço que o bloco já usa para "sem valor": um
 * cartão que não sabe o número diz que não sabe, em vez de exibir o nome
 * interno de uma classe.
 */
function indicatorText(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'object') return '—';
  return formatIsoDate(String(raw));
}

/**
 * Uma linha do resolver traduzida para as chaves que o gráfico declara.
 *
 * Convenções do resolver: `bucket` é o eixo X e `value` é a primeira série.
 * Extraída porque a série comparativa precisa passar pela MESMA tradução —
 * duas cópias divergiriam, e o comparativo apareceria com a chave crua
 * enquanto a série principal usa a declarada.
 */
function chartRow(
  r: Record<string, unknown>,
  chartBlock: ChartBlock,
): Record<string, string | number> {
  const firstDataKey = chartBlock.dataKeys?.[0];
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) {
    let remapped = k;
    if (k === 'bucket') remapped = chartBlock.xAxisKey || 'bucket';
    else if (k === 'value' && firstDataKey && firstDataKey !== 'value') remapped = firstDataKey;

    const raw = unwrapCell(v);
    if (typeof raw === 'number' || typeof raw === 'string') out[remapped] = raw;
    // `cellText` e não `String`: booleano vira texto, e o STRUCT que
    // sobrar vira vazio em vez de `[object Object]` no eixo do gráfico.
    else out[remapped] = cellText(raw);
  }
  return out;
}

/** Prefixo das colunas que carregam a série do período comparativo. */
export const COMPARISON_PREFIX = '__cmp_';
/** Coluna com o rótulo do ponto comparativo (o mês de lá, para o tooltip). */
export const COMPARISON_LABEL = '__cmpRotulo';

/**
 * Mescla a série do período comparativo no dado do gráfico.
 *
 * ─── Alinhamento por POSIÇÃO, não por data ───
 *
 * Os dois períodos têm meses diferentes: mai–jul contra jan–mar não tem um
 * único ponto do eixo em comum. Casar por data desenharia duas curvas em
 * trechos distintos do eixo, lado a lado, que é o oposto de comparar. O que se
 * compara é o PERCURSO: o 1º mês de um período contra o 1º do outro, o 2º
 * contra o 2º. Por isso o eixo continua sendo o do período atual e a série de
 * lá entra na mesma posição — com o mês real dela guardado em
 * `COMPARISON_LABEL`, para o tooltip poder dizer de onde veio cada número.
 *
 * Períodos de tamanhos diferentes simplesmente sobram ou faltam nas pontas:
 * ponto sem par fica sem valor comparativo, e a linha se interrompe ali em vez
 * de inventar continuidade.
 */
export function mergeComparisonSeries(
  chartBlock: ChartBlock,
  comparisonRows: Array<Record<string, unknown>>,
): void {
  const currentRows = chartBlock.data;
  if (!currentRows?.length || comparisonRows.length === 0) return;

  const axis = chartBlock.xAxisKey || 'bucket';
  const keys = chartBlock.dataKeys ?? [];
  const comparisonChartRows = comparisonRows.map((r) => chartRow(r, chartBlock));

  chartBlock.data = currentRows.map((row, i) => {
    const comparisonRow = comparisonChartRows[i];
    if (!comparisonRow) return row;
    const merged: Record<string, string | number> = { ...row };
    for (const key of keys) {
      const value = comparisonRow[key];
      if (typeof value === 'number' || typeof value === 'string') {
        merged[`${COMPARISON_PREFIX}${key}`] = value;
      }
    }
    const label = comparisonRow[axis];
    if (label !== undefined) merged[COMPARISON_LABEL] = label;
    return merged;
  });
}

/** O número que representa um conjunto de linhas: o último ponto, ou o único. */
function representativeValue(rows: Array<Record<string, unknown>>): number | null {
  const last = rows[rows.length - 1];
  if (!last) return null;
  return cellNumber(last.value ?? last[Object.keys(last)[0]]);
}

/**
 * Escreve no bloco o resultado do PERÍODO COMPARATIVO.
 *
 * Roda depois de `applyMetricRowsToBlock` e só quando a comparação está ligada
 * — é o que faz o switch valer alguma coisa. Antes ele não disparava consulta
 * nenhuma: o "vs anterior" exibido vinha do penúltimo ponto da própria série,
 * então escolher jan–mar como comparativo não mexia em número algum. O
 * controle prometia uma leitura e o bloco mostrava outra.
 *
 * Só os blocos que TÊM a noção de "anterior" mudam. Um gráfico de série ou uma
 * tabela precisariam desenhar dois períodos sobrepostos, que é outra coisa —
 * e inventar um número "anterior" para eles seria pior que não mostrar nada.
 */
export function applyComparisonToBlock(
  block: CanvasBlock,
  currentRows: Array<Record<string, unknown>>,
  comparisonRows: Array<Record<string, unknown>>,
  metricFollowsPeriodEnd = true,
): void {
  /*
   * Métrica que não segue o fim do período devolve o MESMO número para
   * qualquer recorte — as duas consultas do comparativo voltam idênticas, e a
   * variação daria 0,0% sempre. Um selo de "sem variação" onde não houve
   * comparação nenhuma é pior que selo nenhum: afirma um achado inexistente.
   *
   * ⚠️ Isto NÃO exclui a métrica de posição. O pin dela calcula o `MAX` dentro
   * da faixa (`{filter.ate}`), então a consulta comparativa volta com o mês do
   * OUTRO período. A guarda perguntava `reactsToPeriod` — que só enxerga
   * `{filter.date_range}` — e por isso reprovava os 46 KPIs e os 4 medidores
   * do Vila Rosa, que são exatamente os blocos capazes de desenhar o selo. O
   * predicado certo é `followsPeriodEnd`; fora ficam só os pins cegos, sem
   * `{filter.ate}`.
   */
  if (!metricFollowsPeriodEnd) return;
  if (!supportsComparison(block.type)) return;

  /*
   * O gráfico vem ANTES da guarda do valor representativo — ele não precisa de
   * um, porque sobrepõe a série inteira. A guarda serve a KPI e comparação,
   * que reduzem o período a um número, e estava abortando a sobreposição de
   * toda série SEM coluna `value`: em `{bucket, credit, debit}` o
   * "representativo" caía no `bucket`, uma data, que não é número. O gráfico
   * de Entradas & Saídas ficava sem comparativo enquanto o de Inadimplência,
   * que tem `value`, funcionava — e nada na tela explicava a diferença.
   */
  if (block.type === 'chart') {
    mergeComparisonSeries(block as ChartBlock, comparisonRows);
    return;
  }

  const previous = representativeValue(comparisonRows);
  if (previous === null) return;

  if (block.type === 'comparison') {
    const comparisonBlock = block as import('@/shared/config/agents/types').ComparisonBlock;
    comparisonBlock.previous = previous;
    return;
  }

  /*
   * KPI, gauge e progresso são a MESMA leitura: um número que resume o
   * período. Por isso recebem o mesmo selo de variação, e não três desenhos
   * diferentes — o gauge tinha o arco do covenant e o progresso a barra da
   * meta, e nenhum dos dois dizia nada sobre o período comparativo.
   */
  if (block.type === 'kpi' || block.type === 'gauge' || block.type === 'progress') {
    const current = representativeValue(currentRows);
    // Sem base não há variação: dividir por zero produziria `Infinity`, e um
    // "+∞%" no canto de um indicador é pior que nenhum selo.
    if (current === null || previous === 0) return;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const kpiBlock = block as SingleKpiBlock;
    kpiBlock.deltaPercent = `${formatNumber(change, 1)}%`;
    /*
     * `deltaDirection`, não `trendDirection`: este último é da sparkline (mês
     * contra mês anterior da própria série) e é escrito DEPOIS deste, no mesmo
     * bloco. Enquanto nenhum KPI tinha série e nenhum recebia selo, os dois
     * nunca se cruzaram; com 38 cartões com série, compartilhar o campo faria o
     * card exibir a porcentagem de um período com a seta do outro.
     *
     * O tipo só admite alta e baixa. Variação exatamente zero não recebe seta:
     * apontar para cima com 0,0% ao lado afirmaria uma direção que não houve.
     */
    if (change > 0) kpiBlock.deltaDirection = 'up';
    else if (change < 0) kpiBlock.deltaDirection = 'down';
  }
}

/**
 * Escreve no bloco o resultado da métrica — o único lugar que faz isso.
 *
 * ⚠️ Todo campo escrito aqui é DADO, e precisa constar em `DATA_FIELDS`
 * (`@/shared/lib/report/block-data`), que é quem sabe removê-lo antes de gravar
 * o documento. Exportada para que `block-data.test.ts` compare os dois lados —
 * campo novo aqui sem par lá quebra o teste, em vez de virar número congelado
 * dentro do Firestore meses depois.
 */
export function applyMetricRowsToBlock(
  block: CanvasBlock,
  rows: Array<Record<string, unknown>>,
): void {
  if (block.type === 'kpi') {
    const kpiBlock = block as SingleKpiBlock;
    const first = rows[0];
    if (!first) return;
    const value = unwrapCell(first.value ?? first[Object.keys(first)[0]]);
    const num = cellNumber(value);
    if (num !== null) {
      kpiBlock.value = formatValue(num, kpiBlock.format, kpiBlock.decimals, kpiBlock.suffix);
    } else {
      kpiBlock.value = indicatorText(value);
    }
    return;
  }
  if (block.type === 'chart') {
    const chartBlock = block as ChartBlock;
    chartBlock.data = rows.map((r) => chartRow(r, chartBlock));
    return;
  }
  if (block.type === 'table') {
    (block as TableBlock).rows = rows.map(
      (r) => Object.fromEntries(
        Object.entries(r).map(([column, cell]) => [column, unwrapCell(cell)]),
      ),
    );
    return;
  }
  if (block.type === 'donut') {
    // Convenção: GROUP BY emite uma coluna labelled (alias da entity.attribute)
    // + `value`. A coluna labelled vira o `name` do slice.
    const donutBlock = block as import('@/shared/config/agents/types').DonutBlock;
    donutBlock.slices = rows.map((r) => {
      // `cellNumber`, não `Number(...) || 0`: a célula embrulhada zerava a
      // fatia, e uma fatia de zero é uma afirmação — a de que não há nada ali.
      const num = cellNumber(r.value) ?? 0;
      // Encontrar a primeira coluna que NÃO seja `value`/`bucket` — essa é o name.
      let name = '';
      for (const [k, v] of Object.entries(r)) {
        if (k === 'value' || k === 'bucket') continue;
        name = cellText(v);
        break;
      }
      return { name: name || '—', value: num };
    });
    return;
  }
  if (block.type === 'gauge') {
    const gaugeBlock = block as import('@/shared/config/agents/types').GaugeBlock;
    const first = rows[0];
    if (!first) return;
    // `cellNumber`, não `Number`: a célula embrulhada virava `NaN` e o
    // medidor ficava exibindo o valor que veio do template, sem avisar.
    const num = cellNumber(first.value ?? first[Object.keys(first)[0]]);
    if (num !== null) gaugeBlock.value = num;
    return;
  }
  if (block.type === 'progress') {
    const progressBlock = block as import('@/shared/config/agents/types').ProgressBlock;
    const first = rows[0];
    if (!first) return;
    const num = cellNumber(first.value ?? first[Object.keys(first)[0]]);
    // A meta NÃO vem da consulta — é configuração do bloco. Só o realizado.
    if (num !== null) progressBlock.value = num;
    return;
  }
  if (block.type === 'targets') {
    const targetsBlock = block as import('@/shared/config/agents/types').TargetsBlock;
    targetsBlock.items = rows.flatMap((r) => {
      const label = cellText(r.label ?? r.name ?? r.bucket);
      const value = cellNumber(r.value);
      const target = cellNumber(r.target);
      // Item sem meta não tem régua: renderizá-lo com meta 0 pintaria tudo de
      // verde, que é o oposto de "não sei avaliar".
      if (!label || value === null || target === null) return [];
      const warn = cellNumber(r.warn);
      return [{ label, value, target, ...(warn !== null ? { warn } : {}) }];
    });
    return;
  }
  if (block.type === 'comparison') {
    const comparisonBlock = block as import('@/shared/config/agents/types').ComparisonBlock;
    // Os dois ÚLTIMOS pontos da série: o resolver entrega em ordem cronológica.
    const current = cellNumber(rows[rows.length - 1]?.value);
    const previous = cellNumber(rows[rows.length - 2]?.value);
    if (current !== null) comparisonBlock.current = current;
    if (previous !== null) comparisonBlock.previous = previous;
    return;
  }
  if (block.type === 'sparkrows') {
    const sparkBlock = block as import('@/shared/config/agents/types').SparkRowsBlock;
    const first = rows[0];
    if (!first) return;
    // Uma linha do bloco por COLUNA da métrica pivotada — o bucket é o eixo do
    // tempo, comum a todas, e por isso não vira série.
    const columns = Object.keys(first).filter((k) => k !== 'bucket' && k !== 'month');
    sparkBlock.series = columns.map((columnName) => ({
      name: columnName,
      points: rows.map((r) => cellNumber(r[columnName]) ?? 0),
    }));
    return;
  }
  if (block.type === 'scatter') {
    const scatterBlock = block as import('@/shared/config/agents/types').ScatterBlock;
    scatterBlock.points = rows.flatMap((r) => {
      const x = cellNumber(r.x);
      const y = cellNumber(r.y);
      if (x === null || y === null) return [];
      const size = cellNumber(r.size);
      const group = cellText(r.group);
      return [{ x, y, ...(size !== null ? { size } : {}), ...(group ? { group } : {}) }];
    });
    return;
  }
  if (block.type === 'funnel') {
    const funnelBlock = block as import('@/shared/config/agents/types').FunnelBlock;
    // A ORDEM das linhas é a ordem do fluxo — nunca reordenar aqui.
    funnelBlock.etapas = rows.flatMap((r) => {
      const etapa = cellText(r.etapa ?? r.name ?? r.bucket);
      const value = cellNumber(r.value);
      if (!etapa || value === null) return [];
      return [{ etapa, value }];
    });
    return;
  }
  if (block.type === 'sankey') {
    const sankeyBlock = block as import('@/shared/config/agents/types').SankeyBlock;
    sankeyBlock.fluxos = rows.flatMap((r) => {
      const origem = cellText(r.origem);
      const destino = cellText(r.destino);
      const value = cellNumber(r.value);
      if (!origem || !destino || value === null) return [];
      return [{ origem, destino, value }];
    });
    return;
  }
  if (block.type === 'boxplot') {
    const boxBlock = block as import('@/shared/config/agents/types').BoxplotBlock;
    boxBlock.grupos = rows.flatMap((r) => {
      const grupo = cellText(r.grupo);
      const min = cellNumber(r.min);
      const q1 = cellNumber(r.q1);
      const mediana = cellNumber(r.mediana);
      const q3 = cellNumber(r.q3);
      const max = cellNumber(r.max);
      // Quartil faltando não tem conserto no desenho: uma caixa sem q3 seria
      // uma caixa inventada.
      if (!grupo || [min, q1, mediana, q3, max].some((v) => v === null)) return [];
      return [{ grupo, min: min!, q1: q1!, mediana: mediana!, q3: q3!, max: max! }];
    });
    return;
  }
  if (block.type === 'treemap') {
    const treeBlock = block as import('@/shared/config/agents/types').TreemapBlock;
    // Mesma convenção da rosca: a primeira coluna que não é `value` é o rótulo.
    treeBlock.fatias = rows.flatMap((r) => {
      const value = cellNumber(r.value);
      if (value === null) return [];
      let name = '';
      for (const [k, v] of Object.entries(r)) {
        if (k === 'value' || k === 'bucket') continue;
        name = cellText(v);
        break;
      }
      return [{ name: name || '—', value }];
    });
    return;
  }
  if (block.type === 'heatmap') {
    const heatmapBlock = block as import('@/shared/config/agents/types').HeatmapBlock;
    heatmapBlock.cells = rows.flatMap((r) => {
      const row = cellText(r.row);
      const col = cellText(r.col);
      const value = cellNumber(r.value);
      // Célula sem valor é OMITIDA, não zerada: a matriz de safra depende de
      // "ainda não aconteceu" ser visualmente diferente de "deu zero".
      if (!row || !col || value === null) return [];
      return [{ row, col, value }];
    });
  }
}

export function applySparklineRowsToKpi(
  block: SingleKpiBlock,
  rows: Array<Record<string, unknown>>,
): void {
  if (rows.length === 0) return;
  /*
   * Mês sem medição é OMITIDO, não zerado.
   *
   * `Number(v) || 0` desenhava um despenhadeiro até o zero que não aconteceu.
   * O princípio contrário já está escrito logo acima, na matriz de safra:
   * "ainda não aconteceu" tem de ser visualmente diferente de "deu zero" — a
   * série do KPI violava a regra da própria casa. Omitir liga os vizinhos por
   * uma reta, que afirma menos: uma continuidade que não se mediu, em vez de
   * uma queda que não houve.
   *
   * Valor e rótulo saem JUNTOS; descartar só um desalinha a curva do eixo.
   */
  const measured = rows.flatMap((r) => {
    /*
     * `cellNumber` trata os dois lados disto de uma vez: desembrulha a
     * célula (sem isso, a série embrulhada era descartada INTEIRA, e o cartão
     * ficava sem sparkline nenhuma) e devolve `null` — nunca `NaN` nem zero —
     * para `null`, `undefined` e `''`.
     *
     * Esse último ponto precisa de teste explícito e é ela quem o faz:
     * `Number(null)` e `Number('')` valem 0, e `Number.isFinite(0)` é `true`,
     * de modo que a coerção sozinha deixa passar como zero exatamente o que se
     * quer omitir. Foi o que a primeira versão deste conserto fez, e o teste
     * pegou.
     */
    const n = cellNumber(r.value);
    return n === null ? [] : [{ n, r }];
  });
  if (measured.length === 0) return;

  block.sparklineData = measured.map(({ n }) => n);
  block.sparklineMonths = measured.map(({ r }) => {
    // Séries do resolver emitem `bucket` (DATE_TRUNC); fallback p/ `month` (Fase R/B3).
    return cellText(r.bucket ?? r.month);
  });
  if (measured.length >= 2) {
    const cur = measured[measured.length - 1].n;
    const prev = measured[measured.length - 2].n;
    if (prev !== 0) {
      const pct = ((cur - prev) / prev) * 100;
      /*
       * `formatNumber` (pt-BR), não `toFixed` (en-US). Este selo divide o
       * cartão com o do comparativo, que sempre usou `formatNumber`: o usuário
       * via "-15.8%" ao lado de "+12,3%" no mesmo indicador.
       */
      block.trend = `${formatNumber(pct, 1)}%`;
      block.trendDirection = pct >= 0 ? 'up' : 'down';
    }
  }
}

/** Primeiro dia do mês de uma data ISO (`2026-08-31` → `2026-08-01`). */
export const monthStartOf = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

const DEFAULT_PAGE_FILTERS: NonNullable<CanvasPageFilters['metricPageFilters']> = {
  date_range: { kind: 'date_range', attribute: 'contratos.data_base_report' },
  snapshot: { kind: 'snapshot', attribute: 'contratos.data_base_report' },
};

export function useReportData(
  blockMap: Record<string, CanvasBlock> | undefined,
  // `queries` é aceito para retrocompat com reports antigos (ignorado).
  _queries?: TemplateQueryConfig[],
  filters?: CanvasPageFilters,
  // Produto de origem do report (`report.productRefs[0]`). Quando presente,
  // escopa o fetch pelo produto do PRÓPRIO report; ausente → cai no produto
  // globalmente ativo (retrocompat com reports antigos sem lineage).
  reportProductId?: string,
  // Seleção do usuário nos dropdowns de página declarados pelo template (G3):
  // chave = key de `metricPageFilters` com `control: 'dropdown'`, valor = os
  // valores escolhidos. Só se aplica a filtros `kind: 'in'` com esse control;
  // outros filtros `in` (ex: `projetos`) continuam usando o filtro global.
  pageFilterValues?: Record<string, string[]>,
): ReportDataResult {
  void _queries;
  const dataset = useActiveDataset();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const activeProduct = useActiveProduct();
  const {
    dataBase, dateRange,
    viewMode, compareEnabled, comparePeriod,
  } = useDataFilters();
  /*
   * O catálogo é o que diz, POR MÉTRICA, se o período a recorta e se ela é uma
   * série. Sem isso o modo "Último mês" teria de valer para todas — e recortar
   * uma série a um mês a transforma num ponto solto.
   */
  const metricCatalog = useAppStore((s) => s.metrics) ?? [];
  const metricsRevision = useAppStore((s) => s.metricsRevision);
  const effectiveProductId = reportProductId ?? activeProduct?.id;
  const [populatedBlockMap, setPopulatedBlockMap] =
    useState<Record<string, CanvasBlock> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorsByMetric, setErrorsByMetric] = useState<Record<string, string>>({});
  const fetchedRef = useRef<string | null>(null);

  const metricBindings = blockMap
    ? Object.entries(blockMap)
        .filter(([, b]) => Boolean((b as CanvasBlock).metricId))
        .map(([id, b]) => ({ blockId: id, metricId: (b as CanvasBlock).metricId! }))
    : [];
  /*
   * Métricas de blocos que declararam `ignorePeriodFilter` — projeções.
   *
   * O recorte de período é aplicado no SQL, então "sem filtro" não é uma
   * decisão de renderização: é outra consulta. Elas saem em requisição
   * própria, com o período escancarado.
   */
  const periodlessMetrics = blockMap
    ? new Set(
        Object.values(blockMap)
          .filter((b) => (b as CanvasBlock).ignorePeriodFilter && (b as CanvasBlock).metricId)
          .map((b) => (b as CanvasBlock).metricId!),
      )
    : new Set<string>();

  const sparklineBindings = blockMap
    ? Object.entries(blockMap)
        .filter(
          ([, b]) =>
            b.type === 'kpi' && Boolean((b as SingleKpiBlock).sparklineMetricId),
        )
        .map(([id, b]) => ({
          blockId: id,
          metricId: (b as SingleKpiBlock).sparklineMetricId!,
        }))
    : [];

  const cacheKey =
    metricBindings.length > 0 || sparklineBindings.length > 0
      ? [
          dataset,
          activeClientId,
          effectiveProductId ?? '',
          dataBase,
          dateRange.start,
          dateRange.end,
          // Sem estes na chave, trocar o modo ou o período comparativo não
          // dispara refetch: o efeito compara a key e desiste.
          viewMode,
          /*
           * O catálogo decide quais métricas aceitam o recorte de um mês
           * ("Último mês") e em que escala sai cada percentual (ADR-0033). Ele
           * chega por outra requisição, e é recarregado quando o chat cria ou
           * corrige uma métrica: se a busca acontecer antes dele, a métrica
           * nova vinha com a faixa inteira e sem escala — e nunca se
           * corrigiria, porque a key não mudaria. A revisão muda a cada
           * catálogo gravado; o tamanho não mudava numa correção.
           */
          metricsRevision,
          compareEnabled ? `${comparePeriod?.start ?? ''}..${comparePeriod?.end ?? ''}` : '',
          metricBindings.map((m) => m.metricId).join(','),
          sparklineBindings.map((m) => m.metricId).join(','),
          // Sem isto, marcar um bloco como projeção não refaz a consulta: a
          // key não muda e o efeito desiste.
          Array.from(periodlessMetrics).sort().join(','),
          JSON.stringify(pageFilterValues ?? {}),
        ].join('|')
      : null;

  const fetchAll = useCallback(async () => {
    if (!blockMap) return;
    if (metricBindings.length === 0 && sparklineBindings.length === 0) return;
    if (!activeClientId) return;
    const end = dateRange.end || dataBase;
    if (!end) return;
    // Guard de corrida: descarta o resultado se a key mudou (filtros/cliente)
    // enquanto este fetch estava em voo — evita resposta antiga sobrescrever a nova.
    const myKey = cacheKey;
    const isCurrent = () => fetchedRef.current === myKey;
    const start =
      dateRange.start ||
      new Date(new Date(end).getTime() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    setLoading(true);
    setError(null);

    try {
      // Compõe pageFilters a partir dos defaults do template (ou hardcode
      // sensato em contratos quando o template não declara).
      const declared = filters?.metricPageFilters ?? DEFAULT_PAGE_FILTERS;

      /**
       * Os filtros de página para um recorte de datas.
       *
       * `singleMonth` traduz o modo "Último mês": a faixa do período encolhe
       * para o mês calendário do fim dele (ver o ramo `date_range` abaixo). O
       * toggle existia na tela, era mandado ao assistente como contexto,
       * contava no badge de filtros ativos, e já não chegava à consulta; depois
       * chegava como o último DIA, o que só servia a foto mensal.
       */
      const pageFiltersFor = (
        slice: { start: string; end: string },
        singleMonth: boolean,
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        /*
         * `ate` acompanha SEMPRE o período, mesmo sem o template declarar: é
         * derivado do mesmo recorte, e é o que os pins de posição usam para
         * dizer "a última medição em ou antes do fim do período". Sem ele,
         * entidade com cadência diferente (certidões param em junho, contratos
         * seguem até julho) esvaziava o cartão ao escolher julho.
         */
        out.ate = { kind: 'ate', value: slice.end, attribute: 'contratos.data_base_report' };
        for (const [key, cfg] of Object.entries(declared)) {
          if (cfg.kind === 'date_range') {
            /*
             * "Último mês" é o MÊS CALENDÁRIO do fim do período, não o dia.
             * Era `coluna = @fim`: certo para foto mensal (uma data por mês, no
             * último dia — medido em todas as tabelas de foto dos dois
             * clientes), e errado para evento — "leads do mês" virava "leads
             * de 31/08". O catálogo do imob contornava escrevendo o mês em
             * cada métrica (`monthEnd`); métrica criada pelo chat não sabia.
             * A faixa do mês devolve o mesmo que o `=` numa foto mensal.
             */
            out[key] = singleMonth
              ? { kind: 'date_range', start: monthStartOf(slice.end), end: slice.end, attribute: cfg.attribute }
              : { kind: 'date_range', start: slice.start, end: slice.end, attribute: cfg.attribute };
          } else if (cfg.kind === 'snapshot') {
            out[key] = { kind: 'snapshot', value: slice.end, attribute: cfg.attribute };
          } else if (cfg.kind === 'in') {
            /*
             * Filtro de página: os valores vêm da seleção do usuário no
             * dropdown da própria página. Vazio → no-op (`1=1`) no resolver.
             *
             * Havia um segundo ramo aqui, para filtro `in` SEM `control`, que
             * era alimentado pelo antigo seletor global de empreendimentos.
             * Nenhum template declarava um desses (os 5 `kind:'in'` existentes
             * têm `control: 'dropdown'`), e o seletor global não existe mais.
             */
            out[key] = { kind: 'in', values: pageFilterValues?.[key] ?? [], attribute: cfg.attribute };
          }
        }
        return out;
      };

      /*
       * Nada alimenta mais os filtros AMBIENTE.
       *
       * Eles vinham do seletor global de empreendimentos e dos seis filtros
       * avançados, que saíram: as opções eram literais no código e nenhuma
       * métrica do catálogo os aplicava (zero `{ambient:…}` nos templates, zero
       * recipes `aggregation`). O canal segue existindo no resolver — é o que
       * um filtro de página `in` usaria se precisasse valer para a página
       * inteira —, mas hoje ninguém o alimenta, e mandar lista vazia diz isso.
       */
      const ambientFilters: AmbientFilter[] = [];

      const allMetricIds = new Set<string>([
        ...metricBindings.map((m) => m.metricId),
        ...sparklineBindings.map((m) => m.metricId),
      ]);

      const byId = new Map(metricCatalog.map((m) => [m.id, m]));

      /**
       * Busca um recorte, partindo as métricas em dois grupos quando preciso.
       *
       * O `pageFilters` do batch vale para TODAS as métricas da requisição, e
       * no modo "Último mês" elas não querem a mesma coisa: um KPI quer o mês
       * final, uma série quer o período inteiro — recortada a um mês ela vira
       * um ponto solto, que não é uma leitura mais focada, é um gráfico
       * quebrado. Duas requisições em paralelo saem mais baratas que um
       * parâmetro por métrica no protocolo do batch.
       */
      const token = await getToken();

      const fetchSlice = async (
        slice: { start: string; end: string },
        options?: { includeProjections?: boolean },
      ) => {
        const allIds = Array.from(allMetricIds);
        /*
         * Projeção não participa do recorte — nem do principal, nem do
         * comparativo. Comparar uma curva de futuro com "o mesmo período do
         * ano passado" não significa nada, e buscá-la duas vezes só pagaria
         * duas consultas para o mesmo resultado.
         */
        const projections = options?.includeProjections === false
          ? []
          : allIds.filter((id) => periodlessMetrics.has(id));
        const ids = allIds.filter((id) => !periodlessMetrics.has(id));

        const singleMonthIds = viewMode === 'snapshot'
          ? ids.filter((id) => acceptsSingleMonthTrim(byId.get(id)))
          : [];
        const rangeIds = ids.filter((id) => !singleMonthIds.includes(id));

        const grupos = [
          rangeIds.length > 0
            ? fetchMetricsBatch(rangeIds, activeClientId, effectiveProductId,
                pageFiltersFor(slice, false), ambientFilters, token)
            : null,
          singleMonthIds.length > 0
            ? fetchMetricsBatch(singleMonthIds, activeClientId, effectiveProductId,
                pageFiltersFor(slice, true), ambientFilters, token)
            : null,
          projections.length > 0
            ? fetchMetricsBatch(projections, activeClientId, effectiveProductId,
                pageFiltersFor(OPEN_PERIOD, false), ambientFilters, token)
            : null,
        ].filter((p): p is ReturnType<typeof fetchMetricsBatch> => p !== null);

        const parts = await Promise.all(grupos);
        const map = new Map<string, Array<Record<string, unknown>>>();
        let errorsByMetric: Record<string, string> = {};
        for (const part of parts) {
          for (const [id, rows] of part.map) map.set(id, rows);
          errorsByMetric = { ...errorsByMetric, ...part.errorsByMetric };
        }
        return { map, errorsByMetric };
      };

      /*
       * O comparativo é uma SEGUNDA consulta, ao período que o usuário
       * escolheu. Antes o switch não disparava consulta nenhuma: o "vs
       * anterior" que os blocos exibiam vinha do penúltimo ponto da própria
       * série, então ligar a comparação e escolher jan–mar não mudava número
       * algum. O controle prometia uma coisa e o número dizia outra.
       */
      const isComparing = Boolean(
        compareEnabled && comparePeriod?.start && comparePeriod?.end,
      );

      const [
        { map: metricRows, errorsByMetric: batchErrors },
        comparison,
      ] = await Promise.all([
        fetchSlice({ start, end }),
        isComparing
          ? fetchSlice(
              { start: comparePeriod!.start, end: comparePeriod!.end },
              { includeProjections: false },
            )
            /*
             * A comparação é SECUNDÁRIA e não pode derrubar o principal.
             *
             * Dentro de um `Promise.all` sem este `catch`, uma falha na segunda
             * consulta rejeitava as duas: o erro subia para o `catch` de fora,
             * a página inteira virava estado de erro e o usuário perdia também
             * os números do período que ele estava olhando — por causa de um
             * extra que ele acabara de ligar. Falhar, aqui, é ficar sem a
             * sobreposição; não é ficar sem o relatório.
             */
            .catch((err) => {
              console.error('[useReportData] período comparativo falhou:', err);
              return null;
            })
          : Promise.resolve(null),
      ]);
      const comparisonRows = comparison?.map ?? null;

      const newBlockMap = JSON.parse(JSON.stringify(blockMap)) as Record<
        string,
        CanvasBlock
      >;

      for (const { blockId, metricId } of metricBindings) {
        const block = newBlockMap[blockId];
        const rows = metricRows.get(metricId);
        if (!block || !rows) continue;
        // A escala do percentual antes de qualquer aplicador — o comparativo
        // inclusive, para as duas séries saírem na mesma régua (ADR-0033).
        const points = byId.get(metricId)?.percentPointColumns;
        const scaled = normalizePercentScale(block, rows, points);
        applyMetricRowsToBlock(block, scaled);
        if (comparisonRows) {
          applyComparisonToBlock(
            block, scaled, normalizePercentScale(block, comparisonRows.get(metricId) ?? [], points),
            followsPeriodEnd(byId.get(metricId)),
          );
        }
      }
      for (const { blockId, metricId } of sparklineBindings) {
        const block = newBlockMap[blockId];
        const rows = metricRows.get(metricId);
        if (!block || block.type !== 'kpi' || !rows) continue;
        applySparklineRowsToKpi(block as SingleKpiBlock, rows);
      }

      if (!isCurrent()) return;
      setPopulatedBlockMap(newBlockMap);
      setErrorsByMetric(batchErrors);
    } catch (err) {
      if (!isCurrent()) return;
      console.error('[useReportData] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [
    blockMap,
    dataset,
    dataBase,
    dateRange.start,
    dateRange.end,
    activeClientId,
    effectiveProductId,
    metricBindings,
    sparklineBindings,
    filters?.metricPageFilters,
    pageFilterValues,
    cacheKey,
  ]);

  useEffect(() => {
    if (!cacheKey || fetchedRef.current === cacheKey) return;
    fetchedRef.current = cacheKey;
    fetchAll();
  }, [cacheKey, fetchAll]);

  // `loading` é ESTADO: só vira `true` dentro do efeito, um render depois de o
  // blockMap existir. Derivar "esperando o primeiro dado" dele deixava um paint
  // no meio com o template cru — e template de gauge nasce `value: 0`, que num
  // covenant de mínimo 1,20x é pintado de VERMELHO. Este flag é calculado no
  // render, então já vale no primeiro.
  const hasDataForThisReport = describesSameBlocks(populatedBlockMap, blockMap);

  /*
   * Memoizado porque `useCanvasSync` tem um efeito que reage a este mapa para
   * devolver o dado ao bloco em edição. Recriá-lo a cada render faria o efeito
   * rodar sempre — `isDataApplied` impede o laço, mas não o trabalho à toa.
   */
  const screenMap = useMemo(
    () => (hasDataForThisReport && blockMap ? mergeDataIntoMap(blockMap, populatedBlockMap) : null),
    [hasDataForThisReport, blockMap, populatedBlockMap],
  );

  return {
    // Enquanto o dado na mão for de outro report, ele não existe para o caller.
    populatedBlockMap: screenMap,
    loading,
    error,
    // Erros são gravados junto com o mapa; se o mapa é de outro report, os
    // erros também são.
    errorsByMetric: hasDataForThisReport ? errorsByMetric : {},
    awaitingFirstData: cacheKey !== null && !hasDataForThisReport && error === null,
  };
}
