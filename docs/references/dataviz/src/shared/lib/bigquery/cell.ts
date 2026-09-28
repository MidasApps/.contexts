/**
 * A célula do BigQuery traduzida para um primitivo do JavaScript.
 *
 * ⚠️ Sem `server-only` de propósito, ao contrário do resto desta pasta: o
 * desembrulho roda nos DOIS lados. No servidor, em `execute-metric`, para que
 * nenhuma linha entre no aplicativo embrulhada; no cliente, em `useReportData`,
 * porque linha também chega de onde o servidor não passou — documento antigo
 * do Firestore, resultado de tool do chat, template importado.
 *
 * ─── Por que existe ───
 *
 * DATE, DATETIME, TIMESTAMP e TIME não voltam do cliente do BigQuery como
 * primitivo: voltam como instância (`BigQueryDate` e irmãs) cujo único campo
 * próprio é `value`. O embrulho ATRAVESSA o JSON da API, então o navegador o
 * recebe igual. Medido:
 *
 *     String(new BigQueryDate('2026-09-15'))        → '[object Object]'
 *     JSON.parse(JSON.stringify(celula))            → { value: '2026-09-15' }
 *     String({ value: '2026-09-15' })               → '[object Object]'
 *     Number({ value: '2026-09-15' })               → NaN
 *
 * Era isso que três indicadores do Vila Rosa exibiam no lugar da data. E o
 * `NaN` é o mesmo defeito calado: o medidor ficava com o valor do template, a
 * rosca zerava a fatia, a sparkline apagava o ponto.
 *
 * NUMERIC e BIGNUMERIC não passam por aqui porque não precisam: chegam como
 * `Big` (big.js), cujo `toJSON` já emite string — o JSON entrega `"1.5"`.
 * INT64 chega como número.
 */

/** O objeto tem a forma exata do embrulho: um único campo próprio, `value`. */
function isWrapper(v: object): v is { value: unknown } {
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === 'value';
}

/**
 * O valor que a célula representa.
 *
 * Primitivo passa intacto. Array desembrulha item a item (`ARRAY_AGG` de
 * datas). STRUCT passa intacto: um objeto com mais de um campo é dado
 * composto, e abri-lo aqui devolveria uma coluna no lugar da linha — por isso
 * a forma é casada com exatidão, e não pela presença de uma chave `value`.
 *
 * @example
 *   unwrapCell({ value: '2026-09-15' })  // '2026-09-15'
 *   unwrapCell(7)                        // 7
 *   unwrapCell({ value: 10, moeda: 'BRL' }) // o próprio STRUCT
 */
export function unwrapCell(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrapCell);
  if (isWrapper(v)) return unwrapCell(v.value);
  return v;
}

/**
 * `unwrapCell` em cada coluna de cada linha — a fronteira por onde o
 * resultado do BigQuery entra no aplicativo.
 *
 * @param rows Linhas como o cliente do BigQuery as devolve.
 * @returns As mesmas linhas, com toda célula embrulhada trocada pelo primitivo.
 */
export function unwrapRows(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>)
        .map(([column, cell]) => [column, unwrapCell(cell)]),
    );
  });
}
