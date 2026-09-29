/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { metrics as CATALOG, groups } from '../real-estate.mjs';
import { METRIC_SHAPES, type MetricShape } from '@/shared/schemas/metric';
import { blocksForShape } from '@/features/report-authoring/schema/block-specs';
import { REAL_ESTATE_SCHEMA } from '../../lib/real-estate-schemas.mjs';

/**
 * Trava o catálogo `imobiliaria.*` (268 métricas) do mesmo jeito que
 * `covenants-v2-shapes.test.ts` trava o do Vila Rosa: shape declarado, colunas
 * existem como `AS <alias>` no template, e — novidade — todo `{entidade.atributo}`
 * existe no schema físico (o que o dry-run do BigQuery também pegaria, mas aqui
 * é instantâneo e sem rede).
 */
interface Metric {
  id: string; shape: MetricShape; outputColumns: string[]; requires: string[]; category: string;
  recipe: { kind: string; template: string };
}
const metrics = CATALOG as Metric[];
const aliasPosition = (template: string, column: string) => template.search(new RegExp(`\\bAS\\s+\`?${column}\`?\\b`, 'i'));

describe('catálogo imobiliaria.* — forma e colunas', () => {
  it('tem 268 métricas em 8 grupos, ids únicos com prefixo imobiliaria.', () => {
    expect(metrics).toHaveLength(268);
    expect(Object.keys(groups)).toHaveLength(8);
    expect(new Set(metrics.map((m) => m.id)).size).toBe(268);
    for (const m of metrics) expect(m.id).toMatch(/^imobiliaria\.[a-z][a-z0-9_]*$/);
  });

  it('toda métrica declara shape conhecido, outputColumns e recipe sql', () => {
    for (const m of metrics) {
      expect((METRIC_SHAPES as readonly string[]).includes(m.shape), `${m.id}: shape ${m.shape}`).toBe(true);
      expect(m.outputColumns.length, `${m.id}: sem outputColumns`).toBeGreaterThan(0);
      expect(new Set(m.outputColumns).size).toBe(m.outputColumns.length);
      expect(m.recipe.kind).toBe('sql');
      expect(blocksForShape(m.shape).length).toBeGreaterThan(0);
    }
  });

  // Sem checagem de ordem: com CTEs o mesmo alias aparece antes do SELECT final,
  // e o front lê por nome (`accessorKey`, `bucket`, `value`…), não por posição.
  it('toda coluna declarada existe como `AS <alias>` no template', () => {
    const orphans: string[] = [];
    for (const m of metrics) {
      for (const column of m.outputColumns) if (aliasPosition(m.recipe.template, column) < 0) orphans.push(`${m.id}.${column}`);
    }
    expect(orphans).toEqual([]);
  });

  it('as colunas de cada shape seguem o contrato dos blocos', () => {
    const expected: Partial<Record<MetricShape, string[]>> = {
      scalar: ['value'], timeseries: ['bucket', 'value'], targets: ['label', 'value', 'target'], points: ['x', 'y'],
      matrix: ['row', 'col', 'value'], funnel: ['etapa', 'value'], flow: ['origem', 'destino', 'value'], distribution: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'],
    };
    for (const m of metrics) {
      const required = expected[m.shape];
      if (required) for (const c of required) expect(m.outputColumns, `${m.id} (${m.shape}) sem ${c}`).toContain(c);
      if (m.shape === 'breakdown') { expect(m.outputColumns).toHaveLength(2); expect(m.outputColumns[1]).toBe('value'); }
      if (m.shape === 'timeseries_multi' || m.shape === 'timeseries_pivot') { expect(m.outputColumns[0]).toBe('bucket'); expect(m.outputColumns.length).toBeGreaterThan(2); }
    }
  });

  it('todo {entidade.atributo} do template existe no schema físico e está em requires', () => {
    const columns = new Map(Object.entries(REAL_ESTATE_SCHEMA).map(([t, cols]) => [t, new Set(cols.map(([n]) => n))]));
    const errors: string[] = [];
    for (const m of metrics) {
      for (const [, entity, attr] of m.recipe.template.matchAll(/\{([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\}/g)) {
        if (entity === 'filter') continue;
        if (!columns.get(entity)?.has(attr)) errors.push(`${m.id}: {${entity}.${attr}}`);
        if (!m.requires.includes(`imobiliaria.${entity}.${attr}`)) errors.push(`${m.id}: requires sem ${entity}.${attr}`);
      }
      for (const [, entity] of m.recipe.template.matchAll(/\{([a-z_][a-z0-9_]*)\}/g)) if (!columns.has(entity)) errors.push(`${m.id}: {${entity}}`);
      for (const [, key] of m.recipe.template.matchAll(/\{filter\.([a-z_]+)[:}]/g)) if (!['ate', 'date_range', 'corretor'].includes(key)) errors.push(`${m.id}: filtro ${key}`);
    }
    expect(errors).toEqual([]);
  });

  it('séries usam {filter.date_range}; cartões de evento e fotos usam o pin de fim de período', () => {
    for (const m of metrics) {
      const t = m.recipe.template;
      const isSeries = ['timeseries', 'timeseries_multi', 'timeseries_pivot'].includes(m.shape);
      if (!isSeries) expect(t.includes('{filter.date_range'), `${m.id} não-série com date_range (quebra em "Último mês")`).toBe(false);
    }
  });
});

/**
 * Estoque de VENDA não conta imóvel só de locação.
 *
 * A foto `estoque_snapshot` guarda os dois lados. Na página de estoque de
 * prontos, a rosca por faixa somava 1.745 ao lado do KPI "Imóveis à venda"
 * de 1.193 — os 552 vagos de aluguel entravam na conta, e o tempo médio
 * saía 475 dias em vez de 361. O lado da locação (`loc_*`, vacância) é
 * justamente o que filtra `finalidade` para o outro lado.
 */
describe('catálogo imobiliaria.* — estoque de venda', () => {
  const RENTAL_SIDE = /^imobiliaria\.(loc_|vacancia_)/;
  const countsAvailableStock = (t: string) => /\{estoque_snapshot\.status\}\s*=\s*'disponivel'/.test(t);

  it('toda métrica de estoque disponível do lado da venda exclui finalidade locacao', () => {
    const offenders = metrics
      .filter((m) => !RENTAL_SIDE.test(m.id) && countsAvailableStock(m.recipe.template))
      .filter((m) => !m.recipe.template.includes("{estoque_snapshot.finalidade} != 'locacao'"))
      .map((m) => m.id);
    expect(offenders).toEqual([]);
  });
});

/**
 * A escala declarada é a escala do SQL (ADR-0032): o helper `sql({ scale })`
 * embrulha o template em `SELECT * REPLACE (100 * col …)` e declara as mesmas
 * colunas em `percentPointColumns`. KPI e tabela leem só a declaração.
 */
describe('catálogo imobiliaria.* — colunas em pontos percentuais', () => {
  const inPoints = (t: string) => /^SELECT \* REPLACE \(/.test(t);

  it('declara pontos exatamente quando o template multiplica por 100', () => {
    const mismatched = metrics
      .filter((m) => inPoints(m.recipe.template) !== Boolean((m as { percentPointColumns?: string[] }).percentPointColumns?.length))
      .map((m) => m.id);
    expect(mismatched).toEqual([]);
  });

  it('toda coluna declarada em pontos existe no resultado', () => {
    const missing = metrics.flatMap((m) =>
      ((m as { percentPointColumns?: string[] }).percentPointColumns ?? [])
        .filter((c) => !m.outputColumns.includes(c))
        .map((c) => `${m.id}.${c}`));
    expect(missing).toEqual([]);
  });
});
