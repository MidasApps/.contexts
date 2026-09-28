/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SingleKpiBlock as SingleKpiBlockType } from '@/shared/config/agents/types';
// O modal embute a `AISidebar`, que depende do router do Next. O assunto aqui
// é a série que chega ao desenho — o chat não entra nela.
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { SingleKpiBlock } from '../SingleKpiBlock';

/**
 * A trajetória do KPI precisa CHEGAR À TELA.
 *
 * Até a migração da ADR-0027 nenhum dos 46 KPIs do Vila Rosa declarava
 * `sparklineMetricId`: o caminho de render existia inteiro e nunca recebia
 * dado, então nenhum teste jamais exercitou o desenho. Com 38 cartões passando
 * a ter série, qualquer guarda a mais no meio do caminho — array vazio, poucos
 * pontos, valores todos iguais — apaga a curva em silêncio, e o card volta a
 * dizer "7,00" sem contar que era 12,06 dois meses antes.
 *
 * O dataset de hoje tem TRÊS pontos (mai, jun, jul). Três é o caso real, não o
 * caso limite.
 */

function block(over: Partial<SingleKpiBlockType> = {}): SingleKpiBlockType {
  return {
    id: 'k1', type: 'kpi', metricId: 'm', label: 'Índice de Recebível',
    value: '7,00', positiveIsGood: true,
    ...over,
  } as SingleKpiBlockType;
}

const THREE_POINT_SERIES = [12.06, 8.31, 7.0];
const THREE_MONTHS = ['2026-05-01', '2026-06-01', '2026-07-01'];

describe('<SingleKpiBlock> — a sparkline desenha', () => {
  it('série de três pontos vira curva no card', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ sparklineData: THREE_POINT_SERIES, sparklineMonths: THREE_MONTHS })} />,
    );
    expect(container.querySelectorAll('.recharts-area-curve')).toHaveLength(1);
  });

  /**
   * Série chapada — três meses no mesmo valor — é informação, não ausência: diz
   * que o indicador não se moveu. Um `min === max` mal tratado no cálculo de
   * domínio some com a linha, e o card fica idêntico ao de quem não tem série.
   */
  it('série sem variação nenhuma ainda desenha', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ sparklineData: [7, 7, 7], sparklineMonths: THREE_MONTHS })} />,
    );
    expect(container.querySelectorAll('.recharts-area-curve')).toHaveLength(1);
  });

  /** Um ponto é um pixel, não uma trajetória (ADR-0027, decisão 3). */
  it('um ponto só não desenha curva nenhuma', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ sparklineData: [7], sparklineMonths: ['2026-07-01'] })} />,
    );
    expect(container.querySelector('.recharts-area-curve')).toBeNull();
  });

  it('sem série o card não reserva faixa de gráfico', () => {
    const { container } = render(<SingleKpiBlock block={block()} />);
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
  });

  /**
   * O esqueleto tem de reservar a faixa de 56px de quem VAI ter série.
   *
   * `sparklineData` é dado, e `withoutMaterializedData()` o remove antes de gravar
   * — o documento que volta do Firestore só tem `sparklineMetricId`. Durante a
   * carga o card portanto não sabia que ia ganhar uma faixa, desenhava o
   * esqueleto sem ela, e crescia 56px quando o dado chegava. Com 0 de 46 KPIs
   * declarando série isso nunca aconteceu; com 38, a página inteira pula.
   */
  it('o esqueleto reserva a faixa de quem declara série', () => {
    const { container } = render(
      <SingleKpiBlock block={block({ sparklineMetricId: 'covenants.indice_recebivel_serie' })} loading />,
    );
    expect(container.querySelector('[aria-busy="true"] .h-14')).toBeTruthy();
  });

  it('quem não declara série não reserva faixa nenhuma', () => {
    const { container } = render(<SingleKpiBlock block={block()} loading />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"] .h-14')).toBeNull();
  });

  /**
   * O modal é onde se vai olhar com atenção. Ele já sabia dizer "Sem série
   * histórica para este indicador" — e era o que dizia para os 46 KPIs.
   */
  /**
   * ─── As DUAS leituras no mesmo cartão ───
   *
   * É a situação que a ADR-0027 cria e que nunca existiu antes: 38 KPIs com
   * série E o comparativo podendo acender. São duas perguntas diferentes —
   * "como variou mês a mês" (a sparkline) e "como está contra o período que
   * escolhi" (o comparativo) — e elas PODEM apontar para lados opostos sem que
   * nenhuma esteja errada.
   *
   * O que não pode é a tela deixar isso ambíguo. Enquanto as duas eram pills
   * gêmeos no cabeçalho, distinguíveis só pelo tooltip, uma leitura passava
   * pela outra — e em tela de toque não há hover para desempatar.
   */
  it('série e comparativo convivem: a curva, um selo de cada, e só um rotulado', () => {
    const { container } = render(
      <SingleKpiBlock
        block={block({
          sparklineData: THREE_POINT_SERIES,
          sparklineMonths: THREE_MONTHS,
          // O que `applySparklineRowsToKpi` grava: jul/26 contra jun/26.
          trend: '-15.8%',
          trendDirection: 'down',
          // O que `applyComparisonToBlock` grava: período × comparativo.
          deltaPercent: '12,3%',
          deltaDirection: 'up',
        })}
      />,
    );

    expect(container.querySelectorAll('.recharts-area-curve')).toHaveLength(1);
    expect(screen.getByText('-15.8%')).toBeTruthy();
    expect(screen.getAllByText(/12[.,]3%/)).toHaveLength(1);
    // Só o comparativo se apresenta em texto; o outro é o selo do cabeçalho.
    expect(screen.getAllByText('vs comparativo')).toHaveLength(1);
  });

  /**
   * Direções opostas não são contradição — são duas medidas de coisas
   * diferentes. Mas a COR de cada uma tem de seguir o juízo do bloco: com
   * `positiveIsGood: false` (inadimplência), cair é bom e subir é ruim, nas
   * duas leituras.
   */
  it('com juízo invertido, cada selo pinta pela própria direção', () => {
    const { container } = render(
      <SingleKpiBlock
        block={block({
          label: 'Inadimplência', positiveIsGood: false,
          sparklineData: THREE_POINT_SERIES, sparklineMonths: THREE_MONTHS,
          trend: '-15.8%', trendDirection: 'down',
          deltaPercent: '12,3%', deltaDirection: 'up',
        })}
      />,
    );

    // Queda mês a mês em inadimplência é boa; alta contra o comparativo é ruim.
    expect(container.querySelector('.text-success')).toBeTruthy();
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });

  it('a série atravessa até o modal expandido', () => {
    const { container } = render(
      <SingleKpiBlock
        block={block({ sparklineData: THREE_POINT_SERIES, sparklineMonths: THREE_MONTHS })}
        expandable
      />,
    );
    fireEvent.click(screen.getByLabelText('Ver detalhes de Índice de Recebível'));

    expect(screen.queryByText('Sem série histórica para este indicador.')).toBeNull();
    // Card + modal: duas curvas na árvore, e a do modal é a que interessa aqui.
    expect(container.ownerDocument.querySelectorAll('.recharts-area-curve').length).toBeGreaterThan(1);
  });
});
