import type { CanvasBlock } from './types';

/**
 * Quais blocos respondem ao modo comparativo — e o que cada um faz nele.
 *
 * ─── Por que aqui, e não dentro do hook ───
 *
 * Isto nasceu como `TIPOS_COM_COMPARATIVO`, três strings dentro de
 * `useReportData`. O efeito foi previsível: o contrato que a IA lê para montar
 * relatório (`block-specs.ts` → `renderBlockCatalog`) não mencionava
 * comparativo em campo nenhum, então ela não tinha como preferir um bloco que
 * responde ao filtro nem avisar que escolheu um que não responde. A capacidade
 * existia de um lado e ninguém sabia do outro — o mesmo padrão que já tinha
 * escondido um selo de variação que chegava ao card e não era desenhado, e um
 * modal que tinha o selo e não recebia o dado.
 *
 * Mora em `shared/` porque as três camadas precisam dele: o pipeline
 * (`shared/hooks`), o contrato da autoria (`features/report-authoring`) e a
 * galeria (`pages/prototypes`). Feature nenhuma pode ser dona de um fato que
 * `shared` também consulta.
 *
 * ⚠️ Bloco novo que aprenda a comparar entra AQUI. Se a lista e o desenho
 * divergirem, a tela mostra uma coisa e o contrato promete outra.
 */
export const COMPARISON_BY_BLOCK: Partial<Record<CanvasBlock['type'], string>> = {
  chart:
    'sobrepõe o período comparativo à série — tracejado na mesma cor em line/area/'
    + 'composed, e uma segunda pilha ao lado no stacked-bar. Alinhado por POSIÇÃO '
    + '(1º mês contra 1º mês), porque dois períodos não têm ponto de eixo em comum.',
  kpi:
    'mostra um selo com a variação contra o período comparativo, colorido pelo '
    + 'juízo do bloco (`positiveIsGood`) e não pelo sinal do número.',
  gauge:
    'mostra o mesmo selo de variação do KPI, ao lado do valor — o arco continua '
    + 'medindo o limite contratado, que é outra pergunta.',
  progress:
    'mostra o selo de variação contra o período comparativo; a barra continua '
    + 'medindo o realizado contra a META, que não muda com o período.',
  comparison:
    'o "anterior" passa a ser o período comparativo escolhido, em vez do '
    + 'penúltimo ponto da própria série.',
};

/**
 * O bloco muda quando a comparação está ligada?
 *
 * `false` NÃO é defeito para a maioria: cascata, histograma e pareto derivam o
 * desenho do próprio período (o acumulado, a base empilhada, as faixas), e
 * desenhar dois produziria duas verdades sobre o mesmo eixo. Rosca e tabela
 * precisariam de outro desenho — dois anéis, colunas por período —, que é
 * trabalho de bloco novo, não de série a mais.
 */
export function supportsComparison(blockType: string): boolean {
  return Boolean(COMPARISON_BY_BLOCK[blockType as CanvasBlock['type']]);
}

/** A frase do contrato para este bloco; vazia quando ele não compara. */
export function comparisonForBlock(blockType: string): string | undefined {
  return COMPARISON_BY_BLOCK[blockType as CanvasBlock['type']];
}
