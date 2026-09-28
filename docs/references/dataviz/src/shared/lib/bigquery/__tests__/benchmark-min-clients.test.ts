import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../client', () => ({
  getBigQueryClient: () => ({ query: queryMock }),
  formatTableRef: (dataset: string, table: string) => `\`${dataset}.${table}\``,
}));

import { queryBenchmarkAggregated, MIN_BENCHMARK_CLIENTS } from '../queries';

/**
 * Schema mínimo que satisfaz `hasField` para todos os BENCHMARK_FIELDS —
 * qualquer carteira abaixo do piso NÃO pode chegar ao BigQuery.
 */
const FIELDS = [
  'saldo_devedor', 'valor_atraso', 'valor_over_90', 'ltv',
  'rating_liquid', 'elegibilidade', 'pdd_liquid', 'pdd_minimo_bacen',
  'categoria_inadimplencia', 'data_base_report',
];

function portfolio(dataset: string) {
  return {
    dataset,
    schema: {
      contratos: Object.fromEntries(FIELDS.map((c) => [c, c])),
    },
  };
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([[]]);
});

describe('piso de carteiras para o benchmark de mercado', () => {
  it('o piso é 3 — com 2, cada participante deduz o outro pela média', () => {
    expect(MIN_BENCHMARK_CLIENTS).toBe(3);
  });

  // Esta é a situação de HOJE: um tenant ativo. Sem o piso, o produto devolvia
  // a carteira do próprio usuário rotulada como "agregado de carteiras Liquid".
  it('com 1 carteira não consulta o BigQuery e não devolve benchmark', async () => {
    const r = await queryBenchmarkAggregated([portfolio('vila_rosa')], '2026-01-01', '2026-12-31');
    expect(r).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('com 2 carteiras ainda não devolve', async () => {
    const r = await queryBenchmarkAggregated(
      [portfolio('a'), portfolio('b')],
      '2026-01-01',
      '2026-12-31',
    );
    expect(r).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('com 3 carteiras elegíveis a consulta acontece', async () => {
    await queryBenchmarkAggregated(
      [portfolio('a'), portfolio('b'), portfolio('c')],
      '2026-01-01',
      '2026-12-31',
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  // O piso conta carteiras ELEGÍVEIS. "Elegível" aqui é mais frouxo do que
  // parece: `hasField` só reprova campo EXPLICITAMENTE marcado indisponível
  // (mapeado para `null`). Campo ausente do schema cai no nome canônico por
  // retrocompatibilidade — logo, conta como elegível.
  it('carteira que declara um campo indisponível não conta para o piso', async () => {
    const withoutOver90 = {
      dataset: 'c',
      schema: { contratos: { ...portfolio('c').schema.contratos, valor_over_90: null } },
    };
    const r = await queryBenchmarkAggregated(
      [portfolio('a'), portfolio('b'), withoutOver90],
      '2026-01-01',
      '2026-12-31',
    );
    expect(r).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('campo apenas AUSENTE do schema não reprova a carteira (retrocompat de hasField)', async () => {
    const leanClient = { dataset: 'c', schema: { contratos: { saldo_devedor: 'saldo_devedor' } } };
    await queryBenchmarkAggregated(
      [portfolio('a'), portfolio('b'), leanClient],
      '2026-01-01',
      '2026-12-31',
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
