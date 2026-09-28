import { describe, it, expect } from 'vitest';
import { createListMetricFieldsTool } from './list-metric-fields';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown> = {}): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const semanticContext = {
  clientId: 'vila-rosa',
  metrics: [],
  dataContracts: [
    {
      contractId: 'liquid-play',
      entities: [
        {
          entityId: 'contratos',
          attributes: [
            { attributeId: 'id_contrato', column: 'id_contrato' },
            { attributeId: 'saldo_devedor', column: 'saldo' },
          ],
        },
        {
          entityId: 'unidades',
          attributes: [{ attributeId: 'area_privativa', column: 'area' }],
        },
      ],
    },
  ],
};

describe('list_metric_fields', () => {
  it('lista entidade, atributos e a ref pronta para requires', async () => {
    const r = await run(createListMetricFieldsTool({ semanticContext }));

    expect(r.ok).toBe(true);
    expect(r.entidades).toEqual([
      {
        contrato: 'liquid-play',
        entidade: 'contratos',
        refDeExemplo: 'liquid-play.contratos.id_contrato',
        atributos: ['id_contrato', 'saldo_devedor'],
      },
      {
        contrato: 'liquid-play',
        entidade: 'unidades',
        refDeExemplo: 'liquid-play.unidades.area_privativa',
        atributos: ['area_privativa'],
      },
    ]);
  });

  it('filtra por entidade quando o modelo já sabe qual quer', async () => {
    const r = await run(createListMetricFieldsTool({ semanticContext }), { entidade: 'unidades' });

    expect((r.entidades as unknown[]).map((e) => (e as { entidade: string }).entidade)).toEqual(['unidades']);
  });

  /**
   * Lista vazia levaria o modelo a concluir que o cliente não tem dado nenhum —
   * e a responder isso ao usuário por causa de um nome digitado errado.
   */
  it('filtro que não casa devolve tudo, não vazio', async () => {
    const r = await run(createListMetricFieldsTool({ semanticContext }), { entidade: 'inexistente' });

    expect((r.entidades as unknown[]).length).toBe(2);
  });

  /**
   * Sem contrato não há placeholder possível, e o modelo escreveria nomes de
   * coluna de memória — que é como nasce a métrica que nunca carrega.
   */
  it('recusa quando não há contrato resolvido, em vez de devolver lista vazia', async () => {
    const r = await run(createListMetricFieldsTool({}));

    expect(r).toMatchObject({ ok: false, error: 'SEM_CONTRATO' });
  });
});
