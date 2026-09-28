import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  validate: vi.fn(),
  save: vi.fn(),
}));

vi.mock('./validate-draft', () => ({ validateDraft: (...a: unknown[]) => h.validate(...a) }));
vi.mock('@/shared/lib/metrics/chat-metric', () => ({
  saveChatMetric: (...a: unknown[]) => h.save(...a),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => ({}) }));

import { createCreateMetricTool } from './create-metric';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown>): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const input = {
  label: 'Vendas por mês',
  sql: 'SELECT {contratos.data} AS bucket, COUNT(*) AS value FROM {contratos} GROUP BY 1',
  requires: ['liquid-play.contratos.data'],
  shape: 'timeseries',
};

let registered: string[] = [];
const ctx = () => ({
  clientId: 'vila-rosa',
  userEmail: 'u@e.com',
  registerMetric: (id: string) => registered.push(id),
});

beforeEach(() => {
  registered = [];
  h.validate.mockReset().mockResolvedValue({ ok: true, outputColumns: ['bucket', 'value'], sql: 'SELECT ...' });
  h.save.mockReset().mockResolvedValue({ metricId: 'chat.vendas_por_mes' });
});

describe('create_metric', () => {
  it('grava a métrica validada e devolve o id para o bloco', async () => {
    const r = await run(createCreateMetricTool(ctx()), input);

    expect(r).toMatchObject({
      action: 'metric_created',
      metricId: 'chat.vendas_por_mes',
      shape: 'timeseries',
      outputColumns: ['bucket', 'value'],
    });
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: expect.objectContaining({
          clientId: 'vila-rosa',
          outputColumns: ['bucket', 'value'],
        }),
      }),
    );
  });

  /**
   * A métrica nasce e o bloco a consome no passo seguinte — mas `xAxisKey` e
   * `dataKeys` são campos que o modelo preenche. No primeiro uso real ele
   * escreveu `xAxisKey: "mes"` para uma métrica que devolve `bucket`: a linha
   * desenha e o eixo X fica em branco.
   */
  it('devolve as chaves que o bloco deve usar, e repassa o aviso da amostra', async () => {
    h.validate.mockResolvedValue({
      ok: true,
      outputColumns: ['bucket', 'value'],
      sql: 's',
      aviso: 'value veio nulo em todas as linhas',
    });

    const r = await run(createCreateMetricTool(ctx()), input);

    expect(r.aviso).toContain('xAxisKey: "bucket"');
    expect(r.aviso).toContain('dataKeys: ["value"]');
    expect(r.aviso).toContain('value veio nulo em todas as linhas');
  });

  /**
   * O catálogo que as tools de bloco conferem é o retrato de quando a
   * requisição chegou. Sem este registro, o `add_kpi_block` da linha seguinte
   * recusaria a métrica recém-criada como inexistente.
   */
  it('anexa o id ao catálogo do turno', async () => {
    await run(createCreateMetricTool(ctx()), input);
    expect(registered).toEqual(['chat.vendas_por_mes']);
  });

  it('não grava nada quando a validação recusa, e explica em que etapa', async () => {
    h.validate.mockResolvedValue({ ok: false, etapa: 'compilacao', error: 'Unrecognized name: x' });

    const r = await run(createCreateMetricTool(ctx()), input);

    expect(r).toMatchObject({ ok: false, error: 'METRICA_INVALIDA', etapa: 'compilacao' });
    expect(r.message).toContain('Unrecognized name: x');
    expect(h.save).not.toHaveBeenCalled();
    expect(registered).toEqual([]);
  });

  /**
   * Escopo de tenant é server-bound (ADR-0006): sem cliente no contexto do
   * servidor não há catálogo onde escrever — e o `clientId` nunca vem do input.
   */
  it('recusa sem tenant, sem tocar em validação nem em escrita', async () => {
    const r = await run(createCreateMetricTool({}), input);

    expect(r).toMatchObject({ ok: false, error: 'SEM_TENANT' });
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('avisa quando a gravação falha, mesmo com a consulta válida', async () => {
    h.save.mockResolvedValue(null);

    const r = await run(createCreateMetricTool(ctx()), input);

    expect(r).toMatchObject({ ok: false, error: 'FALHA_AO_GRAVAR' });
    expect(registered).toEqual([]);
  });

  // ADR-0033: a escala que a validação conferiu é a que vai para o documento.
  it('grava as colunas em pontos que a validação devolveu', async () => {
    h.validate.mockResolvedValue({ ok: true, outputColumns: ['bucket', 'value'], percentPointColumns: ['value'], sql: 's' });

    await run(createCreateMetricTool(ctx()), { ...input, percentPointColumns: ['value'] });

    expect(h.validate).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ percentPointColumns: ['value'] }),
    }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({
      metric: expect.objectContaining({ percentPointColumns: ['value'] }),
    }));
  });
});
