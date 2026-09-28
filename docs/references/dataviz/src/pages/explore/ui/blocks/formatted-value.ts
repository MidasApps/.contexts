import { formatCurrency, formatNumber, formatPercent } from '@/shared/lib/format';

/** Os formatos que os blocos de indicador declaram. */
export type ValueFormat = 'currency' | 'percent' | 'number';

/**
 * Formata o número de um bloco.
 *
 * Existe como módulo próprio porque SEIS blocos precisam exatamente da mesma
 * regra, e a alternativa era cada um reimplementar o mesmo `if/else` — que foi
 * como o donut acabou com uma abreviação de moeda diferente da do KPI.
 */
export function formattedValue(
  v: number,
  format: ValueFormat | undefined,
  decimals?: number | undefined,
  suffix?: string | undefined,
): string {
  const base = format === 'currency'
    ? formatCurrency(v)
    : format === 'percent'
      ? formatPercent(v, decimals ?? 2)
      : formatNumber(v, decimals ?? 0);
  return suffix ? `${base}${suffix}` : base;
}

/**
 * Versão curta, para onde o espaço é apertado (centro do donut, célula da
 * matriz, valor da linha de sparkline).
 */
export function compactValue(
  v: number,
  format: ValueFormat | undefined,
  decimals?: number | undefined,
): string {
  if (format === 'percent') return formatPercent(v, decimals ?? 1);
  const abs = Math.abs(v);
  const prefix = format === 'currency' ? 'R$ ' : '';
  /*
   * `formatNumber` e não `toFixed`: este último emite ponto decimal, e um
   * "R$ 85.2 mi" ao lado de "R$ 71,09 mi" denuncia que veio de outro lugar.
   *
   * As casas são configuráveis porque uma só não basta: duas séries de 8,63 e
   * 8,57 milhões viram "R$ 8,6 mi" as DUAS, e a tela passa a afirmar que são
   * iguais. Quem tem espaço para duas casas deve poder pedi-las.
   */
  const fractionDigits = decimals ?? 1;
  if (abs >= 1e9) return `${prefix}${formatNumber(v / 1e9, fractionDigits)} bi`;
  if (abs >= 1e6) return `${prefix}${formatNumber(v / 1e6, fractionDigits)} mi`;
  if (abs >= 1e3) return `${prefix}${formatNumber(v / 1e3, Math.max(fractionDigits - 1, 0))} mil`;
  return formattedValue(v, format, decimals);
}

/**
 * Pontos de uma série normalizados num caminho SVG de `largura` × `altura`.
 *
 * Série constante (ou de um ponto só) desenha uma reta no meio da caixa, em vez
 * de dividir por zero e sumir.
 */
export function sparklinePath(
  points: number[],
  width: number,
  height: number,
  margin = 2,
): string {
  if (points.length === 0) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const amplitude = max - min;
  const usable = height - margin * 2;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  return points
    .map((p, i) => {
      const y = amplitude === 0 ? height / 2 : margin + (1 - (p - min) / amplitude) * usable;
      return `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
