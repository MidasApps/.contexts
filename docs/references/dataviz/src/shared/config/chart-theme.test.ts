import { describe, it, expect } from 'vitest';
import {
  CHART_AXIS_STYLE,
  CHART_GRID_STYLE,
  CHART_LEGEND_STYLE,
  CHART_TOOLTIP_STYLE,
} from './chart-theme';

/**
 * O defeito que estes testes trancam: eixo, grade, tooltip e legenda cravavam
 * branco (`rgba(255,255,255,…)`, `#FFFFFF`) e fundo quase-preto. O app tem tema
 * claro E escuro; no claro isso virava branco sobre branco.
 *
 * A regra é a mesma do CLAUDE.md: cor hardcoded não troca de tema. Em gráfico,
 * onde a cor vai por prop, isso significa `currentColor` no SVG e
 * `var(--color-…)` no HTML do tooltip/legenda.
 */

/** Qualquer literal de cor que não acompanha o tema. */
const HARDCODED_COLOR = /rgba?\(|#[0-9a-f]{3,8}\b/i;

/** Valores de sombra podem conter rgba() — é elevação, não tinta de conteúdo. */
function colorsOf(style: Record<string, unknown>): string[] {
  return Object.entries(style)
    .filter(([prop]) => !/shadow|filter/i.test(prop))
    .map(([, value]) => String(value));
}

describe('chart-theme — cor acompanha o tema', () => {
  it('rótulo de eixo é currentColor (e não o fill ignorado pelo Recharts)', () => {
    // O Recharts sobrescreve o `fill` do nível do eixo com o `stroke` dele;
    // quem chega ao <text> é o objeto `tick`.
    expect(CHART_AXIS_STYLE.tick.fill).toBe('currentColor');
    expect(CHART_AXIS_STYLE).not.toHaveProperty('fill');
  });

  it('grade usa currentColor com alpha próprio', () => {
    expect(CHART_GRID_STYLE.stroke).toBe('currentColor');
    expect(CHART_GRID_STYLE.strokeOpacity).toBeGreaterThan(0);
    expect(CHART_GRID_STYLE.strokeOpacity).toBeLessThan(1);
  });

  it('tooltip pinta fundo, borda e texto por token do tema', () => {
    const { contentStyle, labelStyle } = CHART_TOOLTIP_STYLE;
    expect(contentStyle.backgroundColor).toContain('var(--color-popover)');
    expect(contentStyle.color).toContain('var(--color-popover-foreground)');
    expect(contentStyle.border).toContain('var(--color-border)');
    expect(labelStyle.color).toContain('var(--color-muted-foreground)');
  });

  it('nenhum estilo de gráfico carrega cor cravada', () => {
    const values = [
      ...colorsOf(CHART_AXIS_STYLE.tick),
      ...colorsOf(CHART_GRID_STYLE),
      ...colorsOf(CHART_TOOLTIP_STYLE.contentStyle),
      ...colorsOf(CHART_TOOLTIP_STYLE.labelStyle),
      ...colorsOf(CHART_TOOLTIP_STYLE.cursor),
      ...colorsOf(CHART_LEGEND_STYLE.wrapperStyle),
    ];
    for (const value of values) {
      expect(value, `"${value}" não troca com o tema`).not.toMatch(HARDCODED_COLOR);
    }
  });
});
