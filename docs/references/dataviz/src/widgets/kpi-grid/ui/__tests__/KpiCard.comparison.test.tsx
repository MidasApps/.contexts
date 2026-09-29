/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KpiCard } from '../KpiCard';

/**
 * O selo do modo comparativo.
 *
 * `periodComparison` chegava ao card e era usado APENAS para a série anterior
 * da sparkline — nunca era desenhado. O efeito: ligar a comparação passava a
 * fazer a segunda consulta, o bloco recebia a variação, e a tela não mudava
 * nada. Quem usa via um controle que não fazia efeito.
 */

function card(periodComparison: {
  deltaPercent: number;
  direction: 'up' | 'down' | 'neutral';
  positiveIsGood: boolean;
}) {
  return render(
    <KpiCard variant="rich" label="Inadimplência" value="4,81%" periodComparison={periodComparison} />,
  );
}

describe('KpiCard — selo do período comparativo', () => {
  it('não desenha selo sem comparação ligada', () => {
    const { container } = render(<KpiCard variant="rich" label="Saldo" value="R$ 1,2 mi" />);
    expect(container.textContent).not.toContain('%');
  });

  it('mostra a variação com sinal', () => {
    const { container } = card({ deltaPercent: 12.34, direction: 'up', positiveIsGood: true });
    expect(within(container).getByText('+12,3%')).toBeTruthy();
  });

  it('queda vem com sinal negativo', () => {
    const { container } = card({ deltaPercent: -8.5, direction: 'down', positiveIsGood: true });
    expect(within(container).getByText('-8,5%')).toBeTruthy();
  });

  /**
   * Subir não é bom em toda métrica: inadimplência que cresce é piora. Quem
   * sabe disso é o bloco; a cor segue esse juízo, e a seta segue o número.
   */
  it('subir é VERDE quando subir é bom', () => {
    const { container } = card({ deltaPercent: 5, direction: 'up', positiveIsGood: true });
    expect(container.querySelector('.text-success')).toBeTruthy();
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('subir é VERMELHO quando subir é ruim', () => {
    const { container } = card({ deltaPercent: 5, direction: 'up', positiveIsGood: false });
    expect(container.querySelector('.text-destructive')).toBeTruthy();
    expect(container.querySelector('.text-success')).toBeNull();
  });

  it('cair é VERDE quando subir é ruim', () => {
    const { container } = card({ deltaPercent: -5, direction: 'down', positiveIsGood: false });
    expect(container.querySelector('.text-success')).toBeTruthy();
  });

  /**
   * O outro selo do card compara com o MÊS ANTERIOR da série. Se os dois
   * dissessem a mesma frase, uma leitura passaria pela outra — e a pessoa
   * atribuiria ao período que escolheu uma variação que é de outra coisa.
   */
  it('convive com o selo de tendência sem se confundir com ele', () => {
    const { container } = render(
      <KpiCard
        variant="rich" label="Inadimplência" value="4,81%"
        trendBadge={{ direction: 'down', percent: '2,1%', positiveIsGood: false }}
        periodComparison={{ deltaPercent: 12.3, direction: 'up', positiveIsGood: false }}
      />,
    );
    expect(within(container).getByText('+12,3%')).toBeTruthy();
    expect(within(container).getByText('2,1%')).toBeTruthy();
  });

  it('sem variação mostra o traço, não uma seta inventada', () => {
    const { container } = card({ deltaPercent: 0, direction: 'neutral', positiveIsGood: true });
    expect(within(container).getByText('0,0%')).toBeTruthy();
  });

  /**
   * UMA leitura, UM selo.
   *
   * O card desenhava a mesma variação DUAS vezes: um pill no cabeçalho e o selo
   * rotulado embaixo do valor. O segundo é de 985f3aa; o primeiro nasceu em
   * 5813f4c sob a crença de que `periodComparison` "nunca era desenhado" — e
   * era, só que a guarda de `applyComparisonToBlock` reprovava todo KPI de
   * posição e o dado nunca chegava. Com a guarda corrigida (ADR-0027), os dois
   * acendem juntos: "+12,3%" no topo e "+12.3%" embaixo, com separadores
   * decimais diferentes, no mesmo cartão.
   */
  it('a variação aparece UMA vez no card', () => {
    card({ deltaPercent: 12.34, direction: 'up', positiveIsGood: true });
    expect(screen.getAllByText(/12[.,]3%/)).toHaveLength(1);
  });

  /**
   * O sinal não é decoração: `{sinal}{Math.abs(delta).toFixed(1)}` com
   * `sinal = delta > 0 ? '+' : ''` apaga o menos das quedas. Uma queda de 8,5%
   * era anunciada como "8.5%" — o número de uma ALTA — ao lado de uma seta para
   * baixo. O cartão se contradizia sozinho.
   */
  it('a queda mantém o sinal em toda aparição', () => {
    card({ deltaPercent: -8.5, direction: 'down', positiveIsGood: true });
    const badges = screen.getAllByText(/8[.,]5%/);
    expect(badges.map((s) => s.textContent)).toEqual(['-8,5%']);
  });

  /**
   * E o selo que sobra tem de dizer CONTRA O QUE compara sem depender de hover:
   * ao lado dele mora o selo de tendência da sparkline, que é outra leitura
   * (mês contra mês anterior). Dois pills iguais no cabeçalho, distinguíveis só
   * pelo tooltip, não distinguem nada em tela sensível ao toque.
   */
  it('o selo que resta é o rotulado, não um pill mudo', () => {
    card({ deltaPercent: 12.34, direction: 'up', positiveIsGood: true });
    expect(screen.getByText('vs comparativo')).toBeTruthy();
  });
});
