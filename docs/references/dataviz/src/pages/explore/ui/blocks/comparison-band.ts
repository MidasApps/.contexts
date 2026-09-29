import { formatMonthLabel } from '@/shared/lib/format';
import { COMPARISON_PREFIX, COMPARISON_LABEL } from '@/shared/hooks/useReportData';

/**
 * Que período o tracejado do gráfico está mostrando.
 *
 * A legenda diz "(comparativo)" e o tooltip nomeia o mês de cada ponto — mas
 * nenhum dos dois responde, de relance, QUAL período é aquele. Pior: com três
 * séries ou mais o item comparativo sai da legenda (dobraria a lista) e o
 * tracejado fica sem explicação nenhuma no cabeçalho.
 *
 * O rótulo mora numa coluna por LINHA (`__cmpRotulo`), porque o alinhamento é
 * por posição e cada ponto de lá tem o seu mês. Para o cabeçalho o que
 * interessa é a faixa: do primeiro ao último.
 *
 * `null` quando não há série comparativa no dado — que é o caso normal.
 */
export function comparisonBand(
  data: ReadonlyArray<Record<string, unknown>> | undefined,
): string | null {
  if (!data?.length) return null;

  const hasSeries = data.some((row) =>
    Object.keys(row).some((key) => key.startsWith(COMPARISON_PREFIX)),
  );
  if (!hasSeries) return null;

  const labels = data
    .map((row) => row[COMPARISON_LABEL])
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '');

  // Série comparativa sem rótulo é possível (o resolver pode não devolver o
  // bucket); dizer só "comparativo" continua sendo verdade.
  if (labels.length === 0) return 'comparativo';

  const first = formatMonthLabel(labels[0]!);
  const last = formatMonthLabel(labels[labels.length - 1]!);
  return first === last ? first : `${first} – ${last}`;
}
