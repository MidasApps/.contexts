import { describe, it, expect } from 'vitest';
import type { ChartBlock } from '@/shared/config/agents/types';
import { authorableSpecs } from '@/features/report-authoring/schema/block-specs';
import {
  LAYOUT_SCENARIOS, PROPORTION_ROWS, ALL_EXAMPLES,
} from '../sample-blocks';

/**
 * A galeria tem de cobrir o que o produto desenha.
 *
 * Ela nasceu com um exemplo por tipo e envelheceu em silêncio: o KPI com
 * sparkline — que é o formato completo do card, com série e variação — nunca
 * entrou, e o resultado foi validar a UI olhando um card propositalmente
 * vazio. Faltavam também `bar`, `area`, `waterfall`, barra horizontal e
 * empilhado 100%, todos em uso nos templates de produção.
 *
 * Estes testes falham quando um tipo, uma variante de gráfico ou uma opção
 * ficam sem representante — em vez de a lacuna aparecer numa captura de tela
 * três semanas depois.
 */

const blocks = ALL_EXAMPLES.map((e) => e.block);
const byType = (t: string) => blocks.filter((b) => b.type === t);

describe('cobertura da galeria', () => {
  it('todo bloco autorável tem ao menos um exemplo', () => {
    for (const spec of authorableSpecs()) {
      expect(byType(spec.type).length, `sem exemplo de "${spec.type}"`).toBeGreaterThan(0);
    }
  });

  /**
   * A união de `chartType` é a lista viva; escrever as variantes à mão aqui só
   * moveria o problema. O `Record` é exaustivo, então tipo novo no bloco
   * quebra a compilação deste teste antes de chegar à galeria.
   */
  it('toda variante de gráfico tem exemplo', () => {
    const required: Record<ChartBlock['chartType'], true> = {
      bar: true, line: true, area: true, composed: true,
      'stacked-bar': true, waterfall: true, histogram: true, pareto: true,
    };
    const present = new Set(
      byType('chart').map((b) => (b as ChartBlock).chartType),
    );
    for (const blockType of Object.keys(required)) {
      expect(present.has(blockType as ChartBlock['chartType']), `sem exemplo de chartType "${blockType}"`)
        .toBe(true);
    }
  });

  /**
   * As opções que mudam o DESENHO, e não só o dado. Cada uma está em uso em
   * pelo menos um template de produção — uma galeria sem elas valida um
   * subconjunto do que o cliente vê.
   */
  it('as variantes de desenho e as opções de produção têm exemplo', () => {
    const hasField = (field: string, value?: unknown) =>
      blocks.some((b) => {
        const v = (b as unknown as Record<string, unknown>)[field];
        return value === undefined ? v !== undefined : v === value;
      });

    expect(hasField('sparklineMetricId'), 'KPI com sparkline').toBe(true);
    expect(hasField('alertThreshold'), 'KPI em alerta').toBe(true);
    expect(hasField('display', 'arc'), 'gauge em arco').toBe(true);
    expect(hasField('display', 'bar'), 'composição em barra').toBe(true);
    expect(hasField('display', 'list'), 'metas em lista').toBe(true);
    expect(hasField('reverseScale', true), 'limite que é teto').toBe(true);
    expect(hasField('showLegendCards', false), 'rosca sem cards').toBe(true);
    expect(hasField('stackOffset', 'expand'), 'empilhado 100%').toBe(true);
    expect(hasField('layout', 'horizontal'), 'barra horizontal').toBe(true);
    expect(hasField('rightAxisKeys'), 'eixo duplo').toBe(true);
  });

  /** Cenário que referencia bloco inexistente renderiza um buraco silencioso. */
  it('todo id citado nos arranjos existe no catálogo', () => {
    const ids = new Set(blocks.map((b) => b.id));
    const cited = [
      ...PROPORTION_ROWS.flatMap((l) => l.ids),
      ...LAYOUT_SCENARIOS.flatMap((c) => c.columns.flatMap((col) => col.ids)),
    ];
    for (const id of cited) {
      expect(ids.has(id), `arranjo cita "${id}", que não existe`).toBe(true);
    }
  });

  /** Coluna que passa de 6 colunas não é uma linha do grid — é um bug. */
  it('nenhum arranjo estoura as 6 colunas do grid', () => {
    for (const scenario of LAYOUT_SCENARIOS) {
      const sum = scenario.columns.reduce((t, c) => t + c.span, 0);
      expect(sum, `"${scenario.title}" soma ${sum} colunas`).toBeLessThanOrEqual(6);
    }
  });
});
