/**
 * ADR-0026 — o filtro compara o campo que o indicador EXIBE.
 *
 * O caso que originou isto: a página mostrava "BANCO INTER" e o seletor
 * oferecia `77`. O nome nasce de um JOIN da própria métrica
 * (`b.nome_reduzido`), e o placeholder só sabia apontar para
 * `entidade.atributo` — vocabulário onde o nome do banco não existe.
 */
import { describe, it, expect } from 'vitest';
import { resolveMetric, type PageFilterValue } from './resolve-metric';
import { MetricDoc, type Metric } from '@/shared/schemas/metric';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';

const binding: ClientDatasetBinding = {
  id: 'ds-test',
  dataSourceId: 'bq-main',
  datasetId: 'vila_rosa_covenants',
  contractRef: 'liquid-play-plus',
  schemaBindings: {
    'transacoes.banco_codigo': 'banco_codigo',
    'transacoes.categoria': 'categoria',
    'transacoes.tipo': 'tipo',
    'transacoes.valor': 'valor',
  },
  schema: {},
  isPrimary: true,
};

function statement(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'covenants.extrato_table',
    label: 'Extrato Detalhado',
    requires: ['liquid-play-plus.transacoes.valor'],
    type: 'table',
    version: '1.0.0',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    recipe: {
      kind: 'sql',
      template:
        'SELECT b.nome_reduzido AS banco, t.{transacoes.valor} AS valor '
        + 'FROM {transacoes} t '
        + 'LEFT JOIN `bq-data-wh.liquid_aux.ba_bancos` b ON t.{transacoes.banco_codigo} = b.numero_codigo '
        + 'WHERE {filter.banco}',
    },
    filterFields: {
      banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
    },
    ...overrides,
  } as Metric;
}

const selection = (values: string[]): Record<string, PageFilterValue> => ({
  banco: { kind: 'in', values },
});

describe('{filter.X} com filterFields declarado', () => {
  it('compara a expressão que a métrica exibe, não a coluna da entidade', () => {
    const { sql, params } = resolveMetric({
      metric: statement(),
      binding,
      pageFilters: selection(['BANCO INTER']),
    });

    expect(sql).toContain('b.nome_reduzido IN UNNEST(@banco)');
    expect(sql).not.toContain('`banco_codigo` IN UNNEST');
    expect(params.banco).toEqual(['BANCO INTER']);
  });

  it('renderiza {entidade.atributo} dentro da expressão', () => {
    const { sql } = resolveMetric({
      metric: statement({
        recipe: {
          kind: 'sql',
          template: 'SELECT 1 FROM {transacoes} t WHERE {filter.tipo}',
        },
        filterFields: { tipo: { expr: 't.{transacoes.tipo}', field: 'tipo' } },
      }),
      binding,
      pageFilters: { tipo: { kind: 'in', values: ['CREDIT'] } },
    });

    expect(sql).toContain('t.`tipo` IN UNNEST(@tipo)');
  });

  it('sem seleção do usuário, vira no-op', () => {
    const { sql, params } = resolveMetric({
      metric: statement(),
      binding,
      pageFilters: selection([]),
    });

    expect(sql).toContain('1=1');
    expect(sql).not.toContain('IN UNNEST');
    expect(params.banco).toBeUndefined();
  });

  /*
   * O pin no template é como os filtros de tempo funcionam — quem escreveu
   * `{filter.date_range:transacoes.data_base_report}` mandou explicitamente na
   * coluna, e nada nesta ADR pode passar por cima disso.
   */
  it('pin explícito no template vence a declaração', () => {
    const { sql } = resolveMetric({
      metric: statement({
        recipe: {
          kind: 'sql',
          template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco:transacoes.banco_codigo}',
        },
      }),
      binding,
      pageFilters: selection(['77']),
    });

    expect(sql).toContain('`banco_codigo` IN UNNEST(@banco)');
    expect(sql).not.toContain('nome_reduzido IN UNNEST');
  });

  /*
   * Filtro gravado antes da ADR-0026 traz `attribute` e a métrica não declara
   * nada. Continua valendo — senão a troca do catálogo apagaria filtro de
   * página que já estava funcionando.
   */
  it('sem declaração, ainda usa o attribute do filtro gravado', () => {
    const { sql } = resolveMetric({
      metric: statement({
        recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco}' },
        filterFields: undefined,
      }),
      binding,
      pageFilters: { banco: { kind: 'in', values: ['77'], attribute: 'transacoes.banco_codigo' } },
    });

    expect(sql).toContain('`banco_codigo` IN UNNEST(@banco)');
  });

  /*
   * Sem declaração E sem attribute não há o que comparar. Isso acontece no
   * intervalo entre a página declarar o filtro e a métrica ganhar o campo — e
   * a página inteira quebrar por causa disso seria pior que não filtrar.
   */
  it('sem declaração e sem attribute, vira no-op em vez de quebrar', () => {
    const { sql } = resolveMetric({
      metric: statement({
        recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco}' },
        filterFields: undefined,
      }),
      binding,
      pageFilters: selection(['BANCO INTER']),
    });

    expect(sql).toContain('1=1');
    expect(sql).not.toContain('IN UNNEST');
  });
});

/*
 * `expr` entra crua no meio de um `WHERE` já montado — a guarda do schema é a
 * única coisa entre o documento e o SQL. O que ela precisa barrar não é "SQL
 * feio": é o marcador que ENGOLE o resto da cláusula. Em `WHERE {filter.banco}
 * AND t.tipo = 'CREDIT'`, uma expr terminada em comentário apaga o `AND` e a
 * consulta continua compilando — erra em silêncio, que é o pior modo de errar.
 */
describe('guarda do schema em filterFields.expr', () => {
  const withExpr = (expr: string) =>
    MetricDoc.safeParse({
      label: 'Extrato Detalhado',
      requires: ['liquid-play-plus.transacoes.valor'],
      recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} t WHERE {filter.banco}' },
      filterFields: { banco: { expr } },
    });

  it('aceita a expressão de coluna que a métrica exibe', () => {
    expect(withExpr('b.nome_reduzido').success).toBe(true);
  });

  it.each([
    ['ponto-e-vírgula', 'b.nome_reduzido; SELECT 1'],
    ['comentário de linha', 'b.nome_reduzido -- resto'],
    ['abertura de bloco', 'b.nome_reduzido /* resto'],
    ['fechamento de bloco', 'b.nome_reduzido */'],
    // GoogleSQL trata `#` como comentário de linha exatamente como `--`.
    ['cerquilha', 'b.nome_reduzido #'],
  ])('recusa expr com %s', (_case, expr) => {
    expect(withExpr(expr).success).toBe(false);
  });
});
