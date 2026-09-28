import { describe, it, expect } from 'vitest';
import { METRIC_SHAPES, MetricShapeEnum } from '../metric';
import {
  acceptsShape, blocksForShape, blockSpec,
} from '@/features/report-authoring/schema/block-specs';

/**
 * A coerência entre a forma da métrica e o bloco que a exibe.
 *
 * A exaustividade tupla ↔ tipo já é travada em tempo de compilação pelo
 * `Record<MetricShape, true>` de `covenants-v2-shapes.test.ts` — o que falta é
 * a coerência do outro lado: `PREFERENCE` (o que o prompt RECOMENDA) e
 * `aceita:` (o que a tool VALIDA) são dois mapas escritos à mão, e nada os
 * obrigava a concordar. Discordância ali produz o pior tipo de falha: o modelo
 * segue a recomendação do prompt e a ferramenta recusa o que ele acabou de ler.
 */
describe('MetricShape ↔ contrato de bloco', () => {
  it('o enum do Zod aceita cada forma da tupla', () => {
    for (const shape of METRIC_SHAPES) {
      expect(MetricShapeEnum.safeParse(shape).success, shape).toBe(true);
    }
  });

  it('toda forma tem ao menos um bloco que a renderiza', () => {
    for (const shape of METRIC_SHAPES) {
      expect(blocksForShape(shape).length, `forma "${shape}" sem bloco preferido`)
        .toBeGreaterThan(0);
    }
  });

  it('o bloco recomendado declara a forma em `aceita:` e é autorável', () => {
    for (const shape of METRIC_SHAPES) {
      for (const block of blocksForShape(shape)) {
        expect(acceptsShape(block, shape), `${block} é recomendado para "${shape}" mas não a declara em aceita:`)
          .toBe(true);
        expect(blockSpec(block).authorable, `${block} é recomendado mas a IA não pode criá-lo`)
          .toBe(true);
      }
    }
  });

  /**
   * O caminho inverso: bloco que declara aceitar uma forma para a qual não é
   * recomendado é legítimo (o `chart` aceita `breakdown` sendo a rosca a
   * primeira escolha). O que não pode existir é bloco autorável que aceita
   * forma NENHUMA e mesmo assim consome métrica — ele seria oferecido no
   * catálogo sem que o modelo saiba com que métrica alimentá-lo.
   */
  it('todo bloco autorável de dado declara ao menos uma forma', () => {
    const withoutMetric = new Set(['text']);
    for (const shape of METRIC_SHAPES) {
      for (const block of blocksForShape(shape)) {
        if (withoutMetric.has(block)) continue;
        expect(blockSpec(block).accepts.length, `${block} não declara nenhuma forma`)
          .toBeGreaterThan(0);
      }
    }
  });
});
