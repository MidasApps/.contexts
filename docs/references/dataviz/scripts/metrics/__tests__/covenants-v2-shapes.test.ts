/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { metrics as CATALOG } from '../covenants-v2.mjs';
import { METRIC_SHAPES, type MetricShape } from '@/shared/schemas/metric';
import { blocksForShape } from '@/features/report-authoring/schema/block-specs';

/**
 * Trava a classificação de forma das 65 métricas `covenants.*`.
 *
 * O que estes testes protegem: `shape` e `outputColumns` são DECLARADOS no
 * catálogo (o resolver não introspecta o template `sql` — devolve
 * `outputColumns: []`). Declaração sem verificação apodrece calada: renomear um
 * alias no SQL não quebra nada em runtime, só faz o bloco renderizar vazio.
 * Por isso a asserção central não é "tem shape", é "cada coluna declarada
 * existe como `AS <alias>` no template, na mesma ordem".
 */

interface CatalogMetric {
  id: string;
  shape: MetricShape;
  outputColumns: string[];
  recipe: { kind: string; template: string };
}

const metrics = CATALOG as CatalogMetric[];

/**
 * Guard de exaustividade: se `MetricShape` (block-specs.ts) ganhar um membro
 * novo, este `Record` para de compilar e `pnpm exec tsc --noEmit` cobra a
 * atualização de `METRIC_SHAPES` em src/shared/schemas/metric.ts.
 */
const ALL_SHAPES: Record<MetricShape, true> = {
  scalar: true,
  timeseries: true,
  timeseries_multi: true,
  timeseries_pivot: true,
  breakdown: true,
  rows: true,
  targets: true,
  points: true,
  matrix: true,
  funnel: true,
  flow: true,
  distribution: true,
};

/** Posição da 1ª ocorrência de `AS <alias>` no template (-1 se ausente). */
function aliasPosition(template: string, column: string): number {
  return template.search(new RegExp(`\\bAS\\s+${column}\\b`, 'i'));
}

describe('METRIC_SHAPES ↔ MetricShape', () => {
  it('a tupla do Zod cobre exatamente as formas de block-specs', () => {
    expect([...METRIC_SHAPES].sort()).toEqual(Object.keys(ALL_SHAPES).sort());
  });

  it('toda forma tem ao menos um bloco que a renderiza', () => {
    for (const shape of METRIC_SHAPES) {
      expect(blocksForShape(shape).length, `forma sem bloco: ${shape}`).toBeGreaterThan(0);
    }
  });
});

describe('catálogo covenants.* — classificação de forma', () => {
  it('tem 65 métricas, todas com id único', () => {
    expect(metrics).toHaveLength(65);
    expect(new Set(metrics.map((m) => m.id)).size).toBe(65);
  });

  it('toda métrica declara shape e outputColumns', () => {
    const withoutShape = metrics.filter((m) => !m.shape);
    const withoutColumns = metrics.filter((m) => !Array.isArray(m.outputColumns) || m.outputColumns.length === 0);
    expect(withoutShape.map((m) => m.id)).toEqual([]);
    expect(withoutColumns.map((m) => m.id)).toEqual([]);
  });

  it('todo shape declarado é uma forma conhecida', () => {
    const invalid = metrics.filter((m) => !(METRIC_SHAPES as readonly string[]).includes(m.shape));
    expect(invalid.map((m) => `${m.id}=${m.shape}`)).toEqual([]);
  });

  it('nenhuma métrica repete nome de coluna', () => {
    const repeated = metrics.filter((m) => new Set(m.outputColumns).size !== m.outputColumns.length);
    expect(repeated.map((m) => m.id)).toEqual([]);
  });

  // O teste que realmente pega regressão: alias renomeado no SQL sem atualizar
  // a declaração (ou vice-versa) não quebra em runtime, só esvazia o bloco.
  it('toda coluna declarada existe como `AS <alias>` no template', () => {
    const orphans: string[] = [];
    for (const m of metrics) {
      for (const column of m.outputColumns) {
        if (aliasPosition(m.recipe.template, column) === -1) orphans.push(`${m.id} → ${column}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('a ordem declarada é a ordem em que os aliases aparecem no SELECT', () => {
    const outOfOrder: string[] = [];
    for (const m of metrics) {
      const positions = m.outputColumns.map((c) => aliasPosition(m.recipe.template, c));
      const ascending = positions.every((p, i) => i === 0 || p > positions[i - 1]);
      if (!ascending) outOfOrder.push(`${m.id}: ${JSON.stringify(m.outputColumns)}`);
    }
    expect(outOfOrder).toEqual([]);
  });
});

describe('catálogo covenants.* — invariantes por forma', () => {
  const byShape = (shape: MetricShape) => metrics.filter((m) => m.shape === shape);

  it('scalar devolve exatamente uma coluna `value`', () => {
    const outside = byShape('scalar').filter((m) => m.outputColumns.join(',') !== 'value');
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  it('timeseries devolve exatamente `{bucket, value}`', () => {
    const outside = byShape('timeseries').filter((m) => m.outputColumns.join(',') !== 'bucket,value');
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  it('timeseries_multi começa em `bucket` e tem ≥2 medidas', () => {
    const outside = byShape('timeseries_multi').filter(
      (m) => m.outputColumns[0] !== 'bucket' || m.outputColumns.length < 3,
    );
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  it('timeseries_pivot começa em `bucket` e tem ≥2 categorias', () => {
    // Exceção documentada: `recebiveis_por_inadimplencia` é pivot com eixo X
    // categórico (tipo_recebivel), não temporal — ver comentário AMBÍGUA no
    // catálogo. Listada aqui de propósito: se surgir outra, o teste cobra
    // decisão explícita em vez de deixar passar.
    const CATEGORICAL_AXIS = new Set(['covenants.recebiveis_por_inadimplencia']);
    const outside = byShape('timeseries_pivot').filter(
      (m) => (m.outputColumns[0] !== 'bucket' && !CATEGORICAL_AXIS.has(m.id)) || m.outputColumns.length < 3,
    );
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  it('breakdown termina em `value`', () => {
    const outside = byShape('breakdown').filter((m) => m.outputColumns.at(-1) !== 'value');
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  it('rows devolve ao menos 2 colunas', () => {
    const outside = byShape('rows').filter((m) => m.outputColumns.length < 2);
    expect(outside.map((m) => m.id)).toEqual([]);
  });

  // Pino da distribuição: qualquer reclassificação futura passa por aqui de
  // propósito — mudar a forma de uma métrica muda o bloco que a IA escolhe.
  it('distribuição das 65', () => {
    const dist: Record<string, number> = {};
    for (const m of metrics) dist[m.shape] = (dist[m.shape] ?? 0) + 1;
    expect(dist).toEqual({
      scalar: 38,
      timeseries: 5,
      timeseries_multi: 4,
      timeseries_pivot: 7,
      breakdown: 5,
      rows: 6,
    });
  });
});

// ADR-0032: coluna declarada em pontos percentuais tem de existir no resultado.
describe('catálogo covenants.* — colunas em pontos percentuais', () => {
  it('toda coluna declarada em pontos existe no resultado', () => {
    const missing = (CATALOG as Array<{ id: string; outputColumns: string[]; percentPointColumns?: string[] }>)
      .flatMap((m) => (m.percentPointColumns ?? []).filter((c) => !m.outputColumns.includes(c)).map((c) => `${m.id}.${c}`));
    expect(missing).toEqual([]);
  });
});
