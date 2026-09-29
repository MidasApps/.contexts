/**
 * A escala do percentual de uma métrica escrita pelo chat (ADR-0033).
 *
 * Todo bloco lê a escala da métrica (`percentPointColumns`): coluna declarada
 * está em pontos (82,27), o resto é fração (0,8227). O modelo escreve o SQL, e
 * a única coisa que o sistema não consegue descobrir sozinho é em que escala o
 * número saiu — por isso a declaração é dele. Esta guarda cobra as duas
 * maneiras de errar que dá para ver sem executar:
 *
 * - declarar em pontos uma coluna que a consulta não devolve;
 * - multiplicar por 100 e não declarar nada — o bloco trataria 82,27 como
 *   fração e o KPI exibiria "8.227%".
 */

/** `100 * x`, `100.0*x`, `x * 100` — e não `x / 100` nem `1000 * x`. */
const TIMES_100 = /(?:^|[^\w.])100(?:\.0+)?\s*\*|\*\s*100(?:\.0+)?(?![\w.])/;

export type PercentScaleCheck =
  | { ok: true; percentPointColumns: string[] }
  | { ok: false; error: string };

export function checkPercentScale(opts: {
  sql: string;
  outputColumns: readonly string[];
  declared: readonly string[];
  /**
   * A declaração veio do documento, não do modelo (correção que não a
   * mencionou). Coluna que sumiu com o SQL novo é podada em silêncio, em vez
   * de reprovar uma mudança em que o modelo nem tocou na escala.
   */
  inherited?: boolean;
}): PercentScaleCheck {
  const { sql, outputColumns } = opts;
  const missing = opts.declared.filter((c) => !outputColumns.includes(c));
  if (missing.length > 0 && !opts.inherited) {
    return {
      ok: false,
      error: `percentPointColumns declara ${missing.join(', ')}, que a consulta não devolve `
        + `(colunas: ${outputColumns.join(', ')}).`,
    };
  }
  const declared = opts.declared.filter((c) => outputColumns.includes(c));
  if (declared.length === 0 && TIMES_100.test(sql)) {
    return {
      ok: false,
      error: 'A consulta multiplica por 100, mas nenhuma coluna foi declarada em pontos. '
        + 'Percentual deve sair como FRAÇÃO (0,8227 para 82,27%) — tire o "× 100" — '
        + 'ou, se o número já está em pontos de propósito, declare a coluna em percentPointColumns.',
    };
  }
  return { ok: true, percentPointColumns: declared };
}
