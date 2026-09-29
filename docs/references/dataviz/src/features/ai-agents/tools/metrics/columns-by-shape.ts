import type { MetricShape } from '@/shared/schemas/metric';

/**
 * O que cada FORMA exige das colunas que a query devolve.
 *
 * A forma diz o formato; os NOMES são load-bearing no front — o adapter de
 * série procura `bucket`/`value`, o KPI lê `value`, o donut usa a primeira
 * coluna diferente de `value` como rótulo. Uma métrica com as colunas certas e
 * os nomes errados monta sem erro nenhum e renderiza vazio: o bloco aparece, e
 * é o usuário quem descobre.
 *
 * Por isso a checagem acontece na criação, contra o schema que o **dry-run**
 * devolveu — não contra o que o modelo declarou de memória.
 *
 * A régua de verdade é `expectedColumns` de `block-specs.ts`, por bloco. Aqui
 * ela aparece por FORMA, que é como a métrica se descreve; o teste
 * `columns-by-shape.test.ts` cruza as duas e falha se divergirem.
 */

type ColumnRule =
  /** Exatamente estas colunas, nesta ordem. */
  | { tipo: 'exatas'; columns: readonly string[] }
  /** Estas primeiro, nesta ordem; colunas extras são permitidas. */
  | { tipo: 'prefixo'; colunas: readonly string[] }
  /** `bucket` primeiro, mais pelo menos uma coluna de medida. */
  | { tipo: 'serie' }
  /** Duas colunas: a dimensão (nome livre) e `value`. */
  | { tipo: 'dimensaoValor' }
  /** Qualquer conjunto de colunas nomeadas. */
  | { tipo: 'livre' };

const RULES: Record<MetricShape, ColumnRule> = {
  scalar: { tipo: 'exatas', columns: ['value'] },
  timeseries: { tipo: 'exatas', columns: ['bucket', 'value'] },
  timeseries_multi: { tipo: 'serie' },
  timeseries_pivot: { tipo: 'serie' },
  breakdown: { tipo: 'dimensaoValor' },
  rows: { tipo: 'livre' },
  targets: { tipo: 'prefixo', colunas: ['label', 'value', 'target'] },
  points: { tipo: 'prefixo', colunas: ['x', 'y'] },
  matrix: { tipo: 'exatas', columns: ['row', 'col', 'value'] },
  funnel: { tipo: 'exatas', columns: ['etapa', 'value'] },
  flow: { tipo: 'exatas', columns: ['origem', 'destino', 'value'] },
  distribution: { tipo: 'exatas', columns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'] },
};

export type ColumnCheckResult = { ok: true } | { ok: false; error: string };

function recusa(shape: MetricShape, columns: readonly string[], expected: string): ColumnCheckResult {
  return {
    ok: false,
    error:
      `A query devolve (${columns.join(', ') || 'nenhuma coluna'}), que não serve para forma `
      + `"${shape}": ${expected}. Renomeie as colunas no SELECT (com AS) ou declare a forma `
      + 'que corresponde ao que a query realmente devolve.',
  };
}

/** A query devolve o que a forma declarada promete? */
export function checkColumns(shape: MetricShape, columns: readonly string[]): ColumnCheckResult {
  const rule = RULES[shape];

  if (rule.tipo === 'exatas') {
    const matches = columns.length === rule.columns.length
      && rule.columns.every((c, i) => columns[i] === c);
    return matches ? { ok: true } : recusa(shape, columns, `esperado exatamente (${rule.columns.join(', ')})`);
  }

  if (rule.tipo === 'prefixo') {
    const prefixMatches = rule.colunas.every((c, i) => columns[i] === c);
    return prefixMatches ? { ok: true } : recusa(shape, columns, `as primeiras colunas devem ser (${rule.colunas.join(', ')})`);
  }

  if (rule.tipo === 'serie') {
    if (columns[0] === 'bucket' && columns.length >= 2) return { ok: true };
    return recusa(shape, columns, 'esperado `bucket` na primeira coluna e ao menos uma coluna de medida');
  }

  if (rule.tipo === 'dimensaoValor') {
    if (columns.length === 2 && columns[1] === 'value') return { ok: true };
    return recusa(shape, columns, 'esperado duas colunas — a dimensão (nome livre) e `value`');
  }

  if (columns.length === 0) return recusa(shape, columns, 'esperado ao menos uma coluna nomeada');
  return { ok: true };
}

/**
 * Como o bloco deve ler estas colunas.
 *
 * O bloco não descobre sozinho: `xAxisKey` e `dataKeys` são campos que o modelo
 * preenche. Visto no primeiro uso real: métrica criada com `bucket`/`value` e
 * gráfico montado com `xAxisKey: "mes"` — a linha desenha e o eixo X fica em
 * branco. Dizer as chaves no resultado da criação fecha o vão entre a métrica
 * que acabou de nascer e o bloco que vai consumi-la.
 */
export function blockKeysHint(columns: readonly string[]): string | undefined {
  if (columns.length < 2) return undefined;
  const [axis, ...series] = columns;
  return `No bloco, use xAxisKey: "${axis}" e dataKeys: [${series.map((c) => `"${c}"`).join(', ')}] — `
    + 'são os nomes que a query devolve; qualquer outro nome desenha o bloco vazio.';
}
