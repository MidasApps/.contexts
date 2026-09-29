/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TrendingUp } from 'lucide-react';
import { CHART_INK_CLASS } from '@/shared/config/chart-theme';
vi.mock('@/widgets/ai-sidebar', () => ({ AISidebar: () => null }));

import { KpiExpandedModal } from '../KpiExpandedModal';

/**
 * O gráfico do modal de KPI nasceu inalcançável.
 *
 * Ele só desenha com `sparklineData.length >= 2`, e até a migração da ADR-0027
 * NENHUM dos 46 KPIs do Vila Rosa tinha série: o que a tela mostrava era sempre
 * o texto de vazio. Com 38 cartões ganhando trajetória, este SVG estreia em
 * produção — e estreia com a tipografia branca cravada
 * (`rgba(255,255,255,0.3)`) que o resto dos gráficos já tinha abandonado. No
 * tema claro isso é branco sobre branco.
 *
 * ⚠️ O `fill` no nível do eixo nunca chegou à tela nem no tema escuro: o
 * Recharts monta o `<text>` do tick com o `stroke` do eixo e só depois aplica o
 * objeto `tick` (ver `CHART_AXIS_STYLE`). O que se via era o `#666` default da
 * lib — ilegível nos dois temas.
 */

const SERIES = [12.06, 8.31, 7.0];
const MONTHS = ['2026-05-01', '2026-06-01', '2026-07-01'];

function open() {
  return render(
    <KpiExpandedModal
      isOpen
      onClose={() => {}}
      config={{
        label: 'Índice de Recebível',
        icon: TrendingUp,
        value: '7,00',
        format: (v: number) => String(v),
      }}
      sparklineData={SERIES}
      months={MONTHS}
    />,
  );
}

describe('<KpiExpandedModal> cor por tema', () => {
  it('o gráfico está DENTRO do wrapper que define a tinta', () => {
    const { baseElement } = open();
    const chart = baseElement.querySelector('.recharts-wrapper');
    expect(chart?.closest(`.${CHART_INK_CLASS}`)).toBeTruthy();
  });

  it('não pinta branco cravado em eixo nem na grade', () => {
    const { baseElement } = open();
    expect(baseElement.querySelector('.recharts-cartesian-grid')).toBeTruthy();
    expect(baseElement.innerHTML).not.toMatch(/rgba\(255\s*,\s*255\s*,\s*255/);
  });

  it('rótulo de eixo sai com fill herdado do tema', () => {
    const { baseElement } = open();
    const tick = baseElement.querySelector('.recharts-cartesian-axis-tick-value');
    expect(tick?.getAttribute('fill')).toBe('currentColor');
  });

  /**
   * O selo de tendência do modal pintava com hex cravado (`#6ECB8A`/`#F27C7C`)
   * enquanto o card, para o MESMO selo, já usava `text-success`/
   * `text-destructive`. Duas técnicas para a mesma decisão, uma delas cega ao
   * tema — e este selo também só passou a aparecer com as séries da ADR-0027.
   */
  it('o selo de tendência usa token, não hex', () => {
    const { baseElement } = render(
      <KpiExpandedModal
        isOpen
        onClose={() => {}}
        config={{
          label: 'Índice de Recebível',
          icon: TrendingUp,
          value: '7,00',
          format: (v: number) => String(v),
          trendBadge: { direction: 'down', percent: '-15,8%', positiveIsGood: true },
        }}
        sparklineData={SERIES}
        months={MONTHS}
      />,
    );
    expect(baseElement.innerHTML).not.toMatch(/#6ECB8A|#F27C7C/i);
    expect(baseElement.querySelector('.text-destructive')).toBeTruthy();
  });
});
