import type { CanvasBlock } from '@/shared/config/agents/types';
import { unwrapCell } from '@/shared/lib/bigquery/cell';

/**
 * A escala do percentual, resolvida entre a métrica e o bloco (ADR-0032/0033).
 *
 * A métrica declara em `percentPointColumns` quais colunas devolve em pontos
 * (82,27); o resto é fração (0,8227). Cada bloco tem a sua convenção de
 * exibição: KPI e tabela multiplicam `percent` por 100 e por isso querem
 * fração; todos os outros formatam o número como vem e querem pontos. Este
 * módulo põe as linhas na convenção do bloco ANTES de qualquer aplicador
 * lê-las — o número certo não depende mais de quem montou o bloco lembrar de
 * casar a escala com o tipo.
 */

/** Blocos que multiplicam `percent` por 100 na exibição. */
const FRACTION_BLOCKS = new Set<CanvasBlock['type']>(['kpi', 'table']);

/** Blocos cujo único número exibido vem da coluna `value`. */
const VALUE_BLOCKS = new Set<CanvasBlock['type']>([
  'kpi', 'gauge', 'progress', 'donut', 'treemap', 'funnel', 'sankey', 'heatmap', 'comparison',
]);

const BOXPLOT_COLUMNS = ['min', 'q1', 'mediana', 'q3', 'max'];
/** Colunas que são eixo ou rótulo, nunca valor — ficam fora da série. */
const AXIS_COLUMNS = new Set(['bucket', 'month']);

type Row = Record<string, unknown>;

/** A coluna escalar do bloco: `value` quando existe, senão a primeira. */
const scalarColumn = (row: Row | undefined): string | undefined =>
  row && ('value' in row ? 'value' : Object.keys(row)[0]);

/**
 * Colunas da MÉTRICA (nomes das linhas, antes de qualquer renomeação) que o
 * bloco exibe com formato percentual.
 *
 * O gráfico renomeia `value` para `dataKeys[0]` e `bucket` para `xAxisKey`
 * depois daqui; por isso a pergunta é feita sobre o nome da métrica, e o
 * `dataKeys[0]` é traduzido de volta para `value` quando é ele que a linha traz.
 */
export function percentColumnsOf(block: CanvasBlock, rows: Row[]): string[] {
  const first = rows[0];
  if (block.type === 'table') {
    return block.columns.filter((c) => c.format === 'percent').map((c) => c.accessorKey);
  }
  if (block.type === 'chart') {
    const right = new Set(block.rightAxisKeys ?? []);
    const firstKey = block.dataKeys[0];
    return block.dataKeys
      .filter((key) => ((right.has(key) ? block.rightFormat ?? block.format : block.format) === 'percent'))
      .map((key) => (key === firstKey && first && !(key in first) && 'value' in first ? 'value' : key));
  }
  if (block.type === 'scatter') {
    return [
      ...(block.xFormat === 'percent' ? ['x'] : []),
      ...(block.yFormat === 'percent' ? ['y'] : []),
    ];
  }
  if (!('format' in block) || block.format !== 'percent') return [];
  if (VALUE_BLOCKS.has(block.type)) {
    const column = block.type === 'kpi' || block.type === 'gauge' || block.type === 'progress'
      ? scalarColumn(first)
      : 'value';
    return column ? [column] : [];
  }
  if (block.type === 'targets') return ['value', 'target', 'warn'];
  if (block.type === 'boxplot') return BOXPLOT_COLUMNS;
  if (block.type === 'sparkrows') return first ? Object.keys(first).filter((k) => !AXIS_COLUMNS.has(k)) : [];
  return [];
}

/**
 * As linhas na convenção de escala do bloco. Devolve as mesmas linhas quando
 * não há o que converter — o caso de quase todo bloco.
 */
export function normalizePercentScale(
  block: CanvasBlock,
  rows: Row[],
  percentPointColumns: readonly string[] = [],
): Row[] {
  const expectsFraction = FRACTION_BLOCKS.has(block.type);
  // Divide em vez de multiplicar por 0,01: 82,5 × 0,01 dá 0,8250000000000001.
  const convert = new Map<string, (n: number) => number>();
  for (const column of percentColumnsOf(block, rows)) {
    const inPoints = percentPointColumns.includes(column);
    if (expectsFraction && inPoints) convert.set(column, (n) => n / 100);
    if (!expectsFraction && !inPoints) convert.set(column, (n) => n * 100);
  }
  if (convert.size === 0) return rows;
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const [column, apply] of convert) {
      const raw = unwrapCell(row[column]);
      const num = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
      if (Number.isFinite(num)) out[column] = apply(num);
    }
    return out;
  });
}
