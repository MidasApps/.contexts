import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  validate: vi.fn(),
  save: vi.fn(),
  uses: vi.fn(),
  doc: vi.fn(),
}));

vi.mock('./validate-draft', () => ({ validateDraft: (...a: unknown[]) => h.validate(...a) }));
vi.mock('./metric-usages', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  metricUsages: (...a: unknown[]) => h.uses(...a),
}));
vi.mock('@/shared/lib/metrics/chat-metric', () => ({
  saveChatMetric: (...a: unknown[]) => h.save(...a),
  nextVersion: () => '1.0.1',
}));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => h.doc() }) }) }),
}));

import { createUpdateMetricTool } from './update-metric';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown>): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

const existingMetric = (over: Record<string, unknown> = {}) => ({
  exists: true,
  data: () => ({
    label: 'Vendas por mês',
    requires: ['liquid-play.contratos.data'],
    recipe: { kind: 'sql', template: 'SELECT 1 AS value' },
    shape: 'timeseries',
    version: '1.0.0',
    createdAt: { s: -1 },
    ownerClientId: 'vila-rosa',
    ...over,
  }),
});

let registered: string[] = [];
const ctx = (over: Record<string, unknown> = {}) => ({
  clientId: 'vila-rosa',
  userEmail: 'u@e.com',
  activeGroupId: 'covenants',
  activeReportId: 'capa',
  registerMetric: (id: string) => registered.push(id),
  ...over,
});

const NEW_SQL = 'SELECT {contratos.data} AS bucket, COUNT(*) AS value FROM {contratos} GROUP BY 1';
const fix = { metricId: 'chat.vendas_por_mes', sql: NEW_SQL, intencao: 'corrigir' };
const redefine = { metricId: 'chat.vendas_por_mes', sql: NEW_SQL, intencao: 'redefinir' };

/** Só a página aberta usa a métrica. */
const onlyHereUses = [{ groupId: 'covenants', reportId: 'capa', reportName: 'Capa', blocos: 1 }];
/** A página aberta e mais uma. */
const othersUse = [
  ...onlyHereUses,
  { groupId: 'operacional', reportId: 'fluxo', reportName: 'Fluxo de Caixa', blocos: 2 },
];

beforeEach(() => {
  registered = [];
  h.doc.mockReset().mockReturnValue(existingMetric());
  h.uses.mockReset().mockResolvedValue(onlyHereUses);
  h.validate.mockReset().mockResolvedValue({ ok: true, outputColumns: ['bucket', 'value'], sql: 's' });
  h.save.mockReset().mockResolvedValue({ metricId: 'chat.vendas_por_mes' });
});

describe('update_metric — corrigir', () => {
  /**
   * O ponto de a métrica ser compartilhada. Variar aqui deixaria a conta errada
   * viva onde já estava e criaria uma segunda, certa — duas telas com números
   * diferentes sob o mesmo nome.
   */
  it('corrige para todas as páginas quando o usuário confirma', async () => {
    h.uses.mockResolvedValue(othersUse);

    const r = await run(createUpdateMetricTool(ctx()), { ...fix, confirmado: true });

    expect(r).toMatchObject({ action: 'metric_updated', metricId: 'chat.vendas_por_mes' });
    expect(r.aviso).toContain('Fluxo de Caixa');
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ metricId: 'chat.vendas_por_mes', version: '1.0.1' }),
    );
  });

  /**
   * Mexer no relatório de outra pessoa se avisa antes, não se descobre depois.
   * Mesmo contrato de dois passos da construção de página.
   */
  it('devolve o alcance e NÃO grava quando a correção sai da página aberta', async () => {
    h.uses.mockResolvedValue(othersUse);

    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r).toMatchObject({ ok: false, error: 'CONFIRMACAO_NECESSARIA' });
    expect(r.message).toContain('Fluxo de Caixa');
    expect(r.usos).toHaveLength(2);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('corrigir o que só esta página usa não pede cerimônia', async () => {
    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r.action).toBe('metric_updated');
    expect(h.save).toHaveBeenCalled();
  });

  /** O que ela era vai para o histórico antes de deixar de existir. */
  it('manda o documento anterior para o histórico ao editar', async () => {
    await run(createUpdateMetricTool(ctx()), fix);

    const args = h.save.mock.calls[0]![0] as { previousDoc?: Record<string, unknown> };
    expect(args.previousDoc).toMatchObject({ label: 'Vendas por mês', version: '1.0.0' });
  });

  /**
   * A correção estaria certa — e é por isso que não pode sair daqui. As 64
   * `covenants.*` são catálogo da Liquid: o alcance é toda a base de clientes.
   */
  it('recusa corrigir métrica global e encaminha para a administração', async () => {
    h.doc.mockReturnValue(existingMetric({ ownerClientId: null }));

    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r).toMatchObject({ ok: false, error: 'CORRECAO_EM_METRICA_GLOBAL' });
    expect(r.message).toContain('administração');
    // Nem chega a varrer o uso: a resposta não depende de quem usa.
    expect(h.uses).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });
});

describe('update_metric — redefinir', () => {
  it('cria variação com linhagem quando outra página usa a original', async () => {
    h.uses.mockResolvedValue(othersUse);
    h.save.mockResolvedValue({ metricId: 'chat.vendas_por_mes_variacao' });

    const r = await run(createUpdateMetricTool(ctx()), redefine);

    expect(r).toMatchObject({
      action: 'metric_variant_created',
      metricId: 'chat.vendas_por_mes_variacao',
      baseMetricId: 'chat.vendas_por_mes',
    });
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: expect.objectContaining({ derivedFrom: 'chat.vendas_por_mes' }),
      }),
    );
    expect(registered).toEqual(['chat.vendas_por_mes_variacao']);
  });

  /**
   * Variação aqui deixaria para trás uma métrica órfã: o bloco deixa de apontar
   * para a antiga no passo seguinte e ninguém mais a usa.
   */
  it('edita no lugar quando ninguém além desta página usa', async () => {
    const r = await run(createUpdateMetricTool(ctx()), redefine);

    expect(r.action).toBe('metric_updated');
    expect(registered).toEqual([]);
  });

  it('métrica de outro dono vira variação, nunca edição', async () => {
    h.doc.mockReturnValue(existingMetric({ ownerClientId: null }));
    h.save.mockResolvedValue({ metricId: 'chat.vendas_por_mes_variacao' });

    const r = await run(createUpdateMetricTool(ctx()), redefine);

    expect(r.action).toBe('metric_variant_created');
    expect(r.motivo).toContain('catálogo compartilhado');
    expect(h.save).toHaveBeenCalledWith(expect.not.objectContaining({ metricId: expect.anything() }));
  });

  it('sem saber que página está aberta, qualquer uso vira variação', async () => {
    h.save.mockResolvedValue({ metricId: 'chat.variacao' });

    const r = await run(
      createUpdateMetricTool(ctx({ activeGroupId: undefined, activeReportId: undefined })),
      redefine,
    );

    expect(r.action).toBe('metric_variant_created');
  });
});

describe('update_metric — recusas', () => {
  it('métrica inexistente manda criar em vez de fingir alteração', async () => {
    h.doc.mockReturnValue({ exists: false, data: () => ({}) });

    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r).toMatchObject({ ok: false, error: 'METRIC_NOT_FOUND' });
    expect(r.message).toContain('create_metric');
    expect(h.save).not.toHaveBeenCalled();
  });

  it('receita que não é texto exige a consulta completa', async () => {
    h.doc.mockReturnValue(existingMetric({ recipe: { kind: 'aggregation' } }));

    const r = await run(createUpdateMetricTool(ctx()), {
      metricId: 'x',
      label: 'Outro nome',
      intencao: 'corrigir',
    });

    expect(r).toMatchObject({ ok: false, error: 'RECEITA_NAO_TEXTUAL' });
  });

  it('métrica antiga sem forma declarada exige shape antes de gravar', async () => {
    h.doc.mockReturnValue(existingMetric({ shape: undefined }));

    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r).toMatchObject({ ok: false, error: 'FORMA_DESCONHECIDA' });
    expect(h.save).not.toHaveBeenCalled();
  });

  it('validação reprovada não grava nem variação nem edição', async () => {
    h.validate.mockResolvedValue({ ok: false, etapa: 'colunas', error: 'faltou value' });

    const r = await run(createUpdateMetricTool(ctx()), fix);

    expect(r).toMatchObject({ ok: false, error: 'METRICA_INVALIDA', etapa: 'colunas' });
    expect(h.save).not.toHaveBeenCalled();
  });
});

// ADR-0033: correção que não fala da escala mantém a do documento, podada.
describe('update_metric — escala do percentual', () => {
  it('sem declaração nova, herda a do documento para a validação podar', async () => {
    h.doc.mockReturnValue(existingMetric({ percentPointColumns: ['value', 'antiga'] }));

    await run(createUpdateMetricTool(ctx()), fix);

    expect(h.validate).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ percentPointColumns: ['value', 'antiga'], percentPointColumnsInherited: true }),
    }));
  });

  it('declaração nova vale como dita, e o salvo é o que a validação devolveu', async () => {
    h.validate.mockResolvedValue({ ok: true, outputColumns: ['bucket', 'value'], percentPointColumns: [], sql: 's' });

    await run(createUpdateMetricTool(ctx()), { ...fix, percentPointColumns: [] });

    expect(h.validate).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ percentPointColumns: [], percentPointColumnsInherited: false }),
    }));
    const saved = h.save.mock.calls[0]![0] as { metric: Record<string, unknown> };
    expect(saved.metric.percentPointColumns).toEqual([]);
    expect(saved.metric).not.toHaveProperty('percentPointColumnsInherited');
  });
});
