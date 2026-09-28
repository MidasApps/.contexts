import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import {
  GRID_COLUMNS, acceptsShape, preferredBlock, blocksForShape, widthOf,
  blockWidth, normalizeWidth, perRow, blockSpec, authorableSpecs,
  type MetricShape,
} from './block-specs';

/**
 * O contrato de bloco é a régua única de layout: store, tools, prompt e
 * validação derivam dele. Estes testes fixam as invariantes que, quebradas,
 * voltam a produzir os três-sistemas-três-réguas que ele veio substituir.
 */
describe('contrato de bloco — invariantes', () => {
  it('toda faixa é coerente: min ≤ recomendado ≤ max, e nada passa do grid', () => {
    for (const spec of authorableSpecs()) {
      const { min, recommended, max } = spec.span;
      expect(min, spec.type).toBeGreaterThanOrEqual(1);
      expect(recommended, spec.type).toBeGreaterThanOrEqual(min);
      expect(max, spec.type).toBeGreaterThanOrEqual(recommended);
      expect(max, spec.type).toBeLessThanOrEqual(GRID_COLUMNS);
    }
  });

  it('todo bloco autorável tem propósito e justificativa de largura', () => {
    for (const spec of authorableSpecs()) {
      expect(spec.purpose.length, spec.type).toBeGreaterThan(20);
      expect(spec.widthRationale.length, spec.type).toBeGreaterThan(20);
    }
  });

  it('toda forma de métrica tem pelo menos um bloco que a renderiza', () => {
    const shapes: MetricShape[] = [
      'scalar', 'timeseries', 'timeseries_multi', 'timeseries_pivot', 'breakdown', 'rows',
    ];
    for (const shape of shapes) {
      const candidates = blocksForShape(shape);
      expect(candidates.length, shape).toBeGreaterThan(0);
      // O preferido precisa de fato aceitar a forma que diz aceitar.
      expect(acceptsShape(preferredBlock(shape), shape), shape).toBe(true);
    }
  });
});

describe('largura por tipo', () => {
  // A régua antiga dizia que um KPI cabia em 1 e um gráfico também. Em 1/6 o
  // valor do KPI quebra em três linhas e o gráfico fica com 33px de plotagem.
  it('nenhum bloco de dado aceita a largura de 1/6', () => {
    for (const type of ['kpi', 'gauge', 'donut', 'chart', 'table'] as const) {
      expect(widthOf(type).min, type).toBeGreaterThanOrEqual(2);
    }
  });

  it('KPI cabe três por linha; tabela ocupa a linha toda', () => {
    expect(perRow('kpi')).toBe(3);
    expect(perRow('table')).toBe(1);
  });

  it('barra horizontal exige mais largura que barra comum', () => {
    const common = widthOf('chart', { chartType: 'bar' });
    const horizontal = widthOf('chart', { chartType: 'bar', layout: 'horizontal' });
    expect(horizontal.min).toBeGreaterThan(common.min);
    expect(horizontal.min).toBe(4);
  });

  it('tabela de 4+ colunas não desce da linha inteira', () => {
    expect(widthOf('table', { columns: 3 }).min).toBe(3);
    expect(widthOf('table', { columns: 7 }).min).toBe(6);
  });

  it('rosca sem cards laterais cabe em duas colunas', () => {
    expect(widthOf('donut').min).toBe(2);
    expect(widthOf('donut').recommended).toBe(3);
    expect(widthOf('donut', { showLegendCards: false }).recommended).toBe(2);
  });

  // Dois eixos de valor comem ~120px antes da plotagem, e o gráfico só existe
  // para comparar séries — apertá-lo anula o motivo de ter o segundo eixo.
  it('eixo duplo exige mais largura que eixo único', () => {
    const single = widthOf('chart', { chartType: 'composed' });
    const double = widthOf('chart', { chartType: 'composed', rightAxis: true });
    expect(double.min).toBeGreaterThanOrEqual(single.min);
    expect(double.min).toBe(4);
  });

  it('composição em barra de linha única cabe em menos que a rosca', () => {
    expect(widthOf('donut', { display: 'bar' }).min).toBe(2);
    // A rosca ganha com largura (os cards laterais); a barra, não.
    expect(widthOf('donut', { display: 'bar' }).max).toBe(6);
  });

  it('lista de metas cabe em menos que o bullet, que precisa da barra', () => {
    expect(widthOf('targets').min).toBe(3);
    expect(widthOf('targets', { display: 'list' }).min).toBe(2);
  });

  it('todo bloco novo declara forma de métrica e é autorável', () => {
    for (const type of ['targets', 'progress', 'comparison', 'sparkrows', 'scatter', 'heatmap'] as const) {
      const spec = blockSpec(type);
      expect(spec.accepts.length, type).toBeGreaterThan(0);
      expect(spec.authorable, type).toBe(true);
    }
  });
});

/**
 * O contrato como INFORMAÇÃO PARA DECIDIR, não só como limites de layout.
 *
 * A versão anterior dizia ao modelo para que serve cada bloco e que largura
 * usar. Faltava tudo o que decide de fato a escolha: quais colunas a métrica
 * precisa devolver (a forma diz o formato, não os nomes), quando NÃO usar o
 * bloco, e para onde ir quando ele não serve. Sem isso o modelo escolhe pelo
 * primeiro tipo que encaixa na forma — e o erro caro é sempre um bloco que
 * ACEITA a métrica e ainda assim é o formato errado para ela.
 */
describe('contrato — o que o modelo precisa para decidir', () => {
  it('todo bloco autorável diz quando NÃO usar', () => {
    for (const spec of authorableSpecs()) {
      expect(spec.whenNotToUse.length, `${spec.type} sem "quandoNaoUsar"`).toBeGreaterThan(30);
    }
  });

  it('todo bloco que consome métrica nomeia as colunas exigidas', () => {
    for (const spec of authorableSpecs()) {
      if (spec.accepts.length === 0) continue;
      expect(spec.expectedColumns.length, `${spec.type} não nomeia colunas`).toBeGreaterThan(0);
    }
  });

  it('as alternativas apontam para blocos que existem e são autoráveis', () => {
    const authorable = new Set(authorableSpecs().map((s) => s.type));
    for (const spec of authorableSpecs()) {
      for (const alt of spec.alternatives ?? []) {
        expect(authorable.has(alt.use), `${spec.type} manda para "${alt.use}", que não é autorável`)
          .toBe(true);
        expect(alt.use, `${spec.type} aponta para si mesmo`).not.toBe(spec.type);
      }
    }
  });

  /**
   * Variante declarada no contrato e ignorada por `widthOf` é promessa vazia:
   * o modelo lê que pode escolher e a ferramenta não muda nada.
   */
  it('toda variante de desenho tem efeito em alguma regra', () => {
    for (const spec of authorableSpecs()) {
      for (const v of spec.variants ?? []) {
        const base = widthOf(spec.type);
        const withVariant = widthOf(spec.type, { display: v.value });
        const changesWidth = JSON.stringify(base) !== JSON.stringify(withVariant);
        const isDefault = v.when.startsWith('padrão');
        expect(changesWidth || isDefault, `${spec.type}/${v.value} não muda nada e não é o padrão`)
          .toBe(true);
      }
    }
  });

  /** O degrau de altura governa o que divide linha — só quem desenha card o tem. */
  it('todo bloco de dado com card declara degrau de altura', () => {
    for (const spec of authorableSpecs()) {
      if (spec.type === 'text' || spec.type === 'table') continue;
      expect(spec.heightFamily, `${spec.type} sem degrau`).toBeDefined();
    }
  });
});

describe('normalizeWidth', () => {
  it('sem pedido, entrega o recomendado do tipo', () => {
    expect(normalizeWidth('kpi', undefined)).toBe(blockSpec('kpi').span.recommended);
    expect(normalizeWidth('table', undefined)).toBe(6);
  });

  it('sobe pedido abaixo do mínimo e desce pedido acima do máximo', () => {
    expect(normalizeWidth('kpi', 1)).toBe(2);
    expect(normalizeWidth('kpi', 6)).toBe(3);
  });

  it('respeita pedido dentro da faixa', () => {
    expect(normalizeWidth('chart', 4)).toBe(4);
  });

  it('aplica o aperto que vem da configuração, não só o do tipo', () => {
    // 3 está dentro da faixa geral do chart, mas não da barra horizontal.
    expect(normalizeWidth('chart', 3, { layout: 'horizontal' })).toBe(4);
  });
});

describe('blockWidth', () => {
  const block = (b: Partial<CanvasBlock> & { type: CanvasBlock['type'] }) =>
    ({ id: 'b1', ...b }) as CanvasBlock;

  it('lê a configuração do próprio bloco para decidir o aperto', () => {
    const horizontal = block({
      type: 'chart', chartType: 'bar', layout: 'horizontal', colSpan: 2,
      xAxisKey: 'x', dataKeys: ['y'],
    });
    expect(blockWidth(horizontal)).toBe(4);
  });

  it('conta as colunas da tabela', () => {
    const wide = block({
      type: 'table', colSpan: 3,
      columns: [1, 2, 3, 4, 5].map((n) => ({ header: `h${n}`, accessorKey: `k${n}` })),
    });
    expect(blockWidth(wide)).toBe(6);
  });

  it('bloco sem colSpan recebe o recomendado, não 1', () => {
    expect(blockWidth(block({ type: 'kpi', label: 'Saldo' }))).toBe(2);
  });
});
