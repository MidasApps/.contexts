import { describe, it, expect } from 'vitest';
import { renderMetricCatalogSection, renderSemanticContextSections } from './shared-context';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * O catálogo que a IA lê precisa distinguir um escalar de uma série pivotada.
 *
 * Antes de `shape`/`outputColumns`, `covenants.contratos_total` e
 * `covenants.rating_serie` chegavam ao modelo como a MESMA coisa
 * (`id — label — description (executável: sql)`) — daí o gráfico de um ponto
 * só e o KPI exibindo o primeiro mês de uma série.
 */

function contextOf(metrics: ClientSemanticContext['metrics']): ClientSemanticContext {
  return { clientId: 'vila-rosa', metrics, dataContracts: [] };
}

const scalarMetric: ClientSemanticContext['metrics'][number] = {
  id: 'covenants.contratos_total',
  name: 'Total de Contratos',
  description: 'Contagem distinta de contratos no snapshot atual.',
  recipe: { kind: 'sql', template: 'x' },
  shape: 'scalar',
  outputColumns: ['value'],
  requires: ['liquid-play.contratos.id_contrato'],
  productId: 'prod-covenants',
};

const pivot: ClientSemanticContext['metrics'][number] = {
  id: 'covenants.rating_serie',
  name: 'Distribuição de Contratos por Rating',
  recipe: { kind: 'sql', template: 'x' },
  shape: 'timeseries_pivot',
  outputColumns: ['bucket', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  requires: ['liquid-play.contratos.rating_liquid'],
  productId: 'prod-covenants',
};

/** Documento antigo, ainda sem backfill. */
const withoutShape: ClientSemanticContext['metrics'][number] = {
  id: 'covenants.legado',
  name: 'Métrica Legada',
  recipe: { kind: 'sql', template: 'x' },
  requires: ['liquid-play.contratos.id_contrato'],
  productId: 'prod-covenants',
};

function lineOf(out: string, id: string): string {
  const line = out.split('\n').find((l) => l.startsWith(`- ${id} `));
  if (!line) throw new Error(`linha ausente para ${id}:\n${out}`);
  return line;
}

describe('renderMetricCatalogSection — forma e colunas', () => {
  it('emite forma e colunas na linha da métrica', () => {
    const out = renderMetricCatalogSection(contextOf([scalarMetric, pivot]));

    expect(lineOf(out, 'covenants.contratos_total')).toContain('forma: scalar');
    expect(lineOf(out, 'covenants.contratos_total')).toContain('colunas: value');

    const pivotLine = lineOf(out, 'covenants.rating_serie');
    expect(pivotLine).toContain('forma: timeseries_pivot');
    expect(pivotLine).toContain('colunas: bucket, a, b, c, d, e, f, g, h');
  });

  it('escalar e série pivotada deixam de ser indistinguíveis', () => {
    const out = renderMetricCatalogSection(contextOf([scalarMetric, pivot]));
    const withoutId = (l: string, id: string) => l.replace(`- ${id} `, '');
    expect(withoutId(lineOf(out, 'covenants.contratos_total'), 'covenants.contratos_total'))
      .not.toBe(withoutId(lineOf(out, 'covenants.rating_serie'), 'covenants.rating_serie'));
  });

  it('mantém o marcador de executável ao lado da forma', () => {
    const out = renderMetricCatalogSection(contextOf([scalarMetric]));
    const line = lineOf(out, 'covenants.contratos_total');
    expect(line).toContain('executável: sql');
    expect(line).toContain('forma: scalar');
  });

  it('métrica sem shape não ganha `forma:` e o prompt avisa para não presumir escalar', () => {
    const out = renderMetricCatalogSection(contextOf([scalarMetric, withoutShape]));
    expect(lineOf(out, 'covenants.legado')).not.toContain('forma:');
    expect(out).toContain('não presuma que é um número único');
  });

  it('legenda das 6 formas entra quando há ao menos uma classificada', () => {
    const out = renderMetricCatalogSection(contextOf([pivot]));
    for (const shape of ['scalar', 'timeseries', 'timeseries_multi', 'timeseries_pivot', 'breakdown', 'rows']) {
      expect(out).toContain(`\`${shape}\``);
    }
  });

  it('catálogo inteiro sem forma não paga a legenda', () => {
    const out = renderMetricCatalogSection(contextOf([withoutShape]));
    expect(out).toContain('covenants.legado');
    expect(out).not.toContain('Escolha o bloco pela forma');
    expect(out).toContain('## Métricas já disponíveis para este cliente');
  });

  it('não despeja SQL nem o objeto de recipe', () => {
    const out = renderMetricCatalogSection(contextOf([scalarMetric, pivot]));
    expect(out).not.toContain('SELECT');
    expect(out).not.toContain('"kind"');
    expect(out).not.toContain('template');
  });

  it('sem métricas → string vazia (prompt inalterado)', () => {
    expect(renderMetricCatalogSection(contextOf([]))).toBe('');
    expect(renderMetricCatalogSection(null)).toBe('');
  });
});

describe('renderSemanticContextSections — mesma seção de métricas', () => {
  it('leva forma e colunas para os prompts dos sub-agentes', () => {
    const out = renderSemanticContextSections(contextOf([pivot]));
    expect(lineOf(out, 'covenants.rating_serie')).toContain('forma: timeseries_pivot');
  });
});
