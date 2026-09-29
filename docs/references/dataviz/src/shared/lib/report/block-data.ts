import type { CanvasBlock } from '@/shared/config/agents/types';

/**
 * A fronteira entre CONFIGURAÇÃO e DADO MATERIALIZADO dentro de um bloco.
 *
 * O bloco declara a métrica; o número vem dela a cada carga (ADR-0015). São
 * duas coisas guardadas na mesma estrutura, e não distingui-las produziu três
 * defeitos ao mesmo tempo: Salvar gravava o número dentro do documento de
 * configuração; a busca de dados não enxergava o bloco que a IA acabou de
 * criar; e toda comparação de "mudou?" acusava alteração a cada valor que
 * chegava.
 *
 * Quem consome: `useCanvasSync` (o que alimenta a busca, o que volta ao bloco,
 * o que conta como alteração) e `ReportPage` (o que vai para o Firestore).
 *
 * ⚠️ `DATA_FIELDS` é o espelho dos TRÊS que escrevem no bloco em
 * `@/shared/hooks/useReportData`: `applyMetricRowsToBlock`,
 * `applyComparisonToBlock` e `applySparklineRowsToKpi`. Os quatro lados
 * precisam concordar, e é `block-data.test.ts` quem verifica isso — campo novo
 * lá sem par aqui vira número congelado dentro do documento de configuração.
 */

/**
 * Exportado só para o teste de espelho.
 *
 * A guarda contra drift era uma lista de tipos escrita à mão dentro do teste, e
 * ela envelheceu exatamente como a lista que deveria proteger: `funnel`,
 * `sankey`, `boxplot` e `treemap` entraram no pipeline e ficaram de fora dela.
 * Derivar do próprio mapa é o que impede a guarda de mentir sobre si mesma.
 */
export const DATA_FIELDS: Partial<Record<CanvasBlock['type'], readonly string[]>> = {
  // `deltaPercent`/`trendDirection` entram aqui, e não em `SPARKLINE_FIELDS`,
  // porque quem os escreve no modo comparativo é `applyComparisonToBlock` —
  // que depende só de `metricId`. Um KPI sem sparkline receberia o selo de
  // variação e o gravaria no Firestore, congelando no documento a comparação
  // de um período que ninguém mais está vendo.
  kpi: ['value', 'deltaPercent', 'deltaDirection', 'trendDirection'],
  gauge: ['value', 'deltaPercent', 'deltaDirection', 'trendDirection'],
  chart: ['data'],
  // `totalRows` alimenta o "Exibindo 100 de N linhas": contagem de UMA
  // execução, que envelhece junto com as linhas que a acompanhavam. Hoje
  // ninguém no pipeline o reescreve, então limpá-lo faz o rodapé sumir — é
  // deliberado. Número congelado de uma consulta antiga mente sobre a carteira;
  // ausência não. Não devolva `totalRows` a este mapa sem antes ter quem o
  // recalcule a cada carga.
  table: ['rows', 'totalRows'],
  donut: ['slices'],
  // `target` do progress NÃO entra aqui: a meta é configuração (contrato,
  // orçamento), não resultado de consulta. Limpá-la ao salvar apagaria o que o
  // autor escreveu — e o bloco voltaria do Firestore sem meta nenhuma.
  progress: ['value', 'deltaPercent', 'deltaDirection', 'trendDirection'],
  targets: ['items'],
  comparison: ['current', 'previous'],
  sparkrows: ['series'],
  scatter: ['points'],
  heatmap: ['cells'],
  funnel: ['etapas'],
  sankey: ['fluxos'],
  boxplot: ['grupos'],
  treemap: ['fatias'],
};

/** Campos que `applySparklineRowsToKpi` escreve (KPI com `sparklineMetricId`). */
const SPARKLINE_FIELDS = [
  'sparklineData',
  'sparklineMonths',
  'trend',
  'trendDirection',
] as const;

/**
 * Quais campos DESTE bloco vêm da métrica.
 *
 * A porta é o `metricId`: sem métrica declarada, o `value` do bloco foi escrito
 * por alguém (template, autoria manual) e ninguém sabe regenerá-lo — apagá-lo
 * seria destruir configuração, não limpar dado. Mesma regra para a sparkline,
 * que tem métrica própria.
 */
export function dataFields(block: CanvasBlock): string[] {
  const fields: string[] = [];
  if (block.metricId) fields.push(...(DATA_FIELDS[block.type] ?? []));
  if (block.type === 'kpi' && block.sparklineMetricId) fields.push(...SPARKLINE_FIELDS);
  return fields;
}

/** O bloco sem nada que o pipeline preencha — a forma que vai para o Firestore. */
export function withoutMaterializedData(block: CanvasBlock): CanvasBlock {
  const fields = dataFields(block);
  if (fields.length === 0) return block;
  const cleaned: Record<string, unknown> = { ...block };
  for (const field of fields) delete cleaned[field];
  // `DonutBlock.slices` e `GaugeBlock.value` são obrigatórios no tipo mesmo
  // sendo dado do resolver (ver as docstrings dos dois em `agents/types.ts`).
  // Enquanto o tipo não acompanhar, a asserção é o preço de removê-los.
  return cleaned as unknown as CanvasBlock;
}

/**
 * `withoutMaterializedData` para o mapa inteiro, com as chaves em ordem canônica.
 *
 * A ordem importa porque a serialização deste mapa é usada como ASSINATURA da
 * configuração, e as duas fontes do mesmo relatório não concordam na ordem de
 * inserção: o documento tem a sua, e o canvas reconstrói o `blockMap` na ordem
 * do `layout` (`flattenKpiBlocks`). Sem ordenar, abrir a edição parecia
 * alteração de conteúdo.
 */
export function configurationMap(
  blockMap: Record<string, CanvasBlock>,
): Record<string, CanvasBlock> {
  return Object.fromEntries(
    Object.entries(blockMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, block]) => [id, withoutMaterializedData(block)]),
  );
}

/**
 * O complemento de `withoutMaterializedData`: só o que veio da métrica.
 *
 * É o que se devolve ao bloco que está na tela — campo a campo, para não
 * sobrescrever configuração que mudou enquanto a busca estava em voo.
 */
export function materializedData(block: CanvasBlock): Partial<CanvasBlock> {
  const origem: Record<string, unknown> = { ...block };
  const data: Record<string, unknown> = {};
  for (const field of dataFields(block)) {
    if (origem[field] !== undefined) data[field] = origem[field];
  }
  return data as Partial<CanvasBlock>;
}

/**
 * O bloco já está com este dado?
 *
 * Guarda contra escrita redundante: quem devolve dado ao bloco escreve num
 * store, e um store que muda sem novidade realimenta quem o observa.
 */
export function isDataApplied(block: CanvasBlock, data: Partial<CanvasBlock>): boolean {
  const current: Record<string, unknown> = { ...block };
  return Object.entries(data as Record<string, unknown>).every(
    ([field, value]) => JSON.stringify(current[field]) === JSON.stringify(value),
  );
}

/**
 * Assinatura do que foi AUTORADO nos blocos — o dado que o pipeline preenche
 * fica de fora.
 *
 * Duas coisas dependem dela, e pelo mesmo motivo: o dado devolvido ao bloco não
 * pode contar como mudança. É ela quem decide (a) o que alimenta a busca —
 * senão o resultado da busca refaria a busca, e o ciclo canvas → hook → canvas
 * nunca fecharia; e (b) o que conta como "a IA mexeu no canvas" — senão um
 * número chegando abriria o modo de edição sozinho.
 */
export function configurationSignature(
  blockMap: Record<string, CanvasBlock> | undefined,
): string {
  return JSON.stringify(blockMap ? configurationMap(blockMap) : null);
}

/** Os dois mapas descrevem a mesma configuração, ignorando o dado de cada um? */
export function isSameConfiguration(
  a: Record<string, CanvasBlock> | undefined,
  b: Record<string, CanvasBlock> | undefined,
): boolean {
  return configurationSignature(a) === configurationSignature(b);
}
