import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock('@/shared/lib/firebase/admin', () => {
  const doc = () => ({
    collection: () => ({ doc }),
    get: async () => h.get(),
    update: h.update,
  });
  return { getDb: () => ({ collection: () => ({ doc }) }) };
});

import { createAddPageFilterTool } from './add-page-filter';

type Result = Record<string, unknown>;
async function run(t: unknown, input: Record<string, unknown>): Promise<Result> {
  return (t as { execute: (a: Record<string, unknown>) => Promise<Result> }).execute(input);
}

/**
 * ADR-0026 — o filtro se declara sobre o campo do indicador.
 *
 * `chat.extrato` exibe o nome do banco (`b.nome_reduzido AS banco`) e o declara
 * filtrável. `covenants.saldo` não filtra nada. É exatamente a página do caso
 * real, onde a tela mostrava "BANCO INTER" e o seletor oferecia `77`.
 */
const semanticContext = {
  clientId: 'vila-rosa',
  metrics: [
    {
      id: 'chat.extrato',
      name: 'Extrato',
      requires: [],
      recipe: {
        kind: 'sql',
        template: 'SELECT b.nome_reduzido AS banco FROM {transacoes} t WHERE {filter.banco}',
      },
      filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } },
    },
    {
      id: 'covenants.saldo',
      name: 'Saldo',
      requires: [],
      recipe: { kind: 'sql', template: 'SELECT 1' },
    },
  ],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const ctx = (over: Record<string, unknown> = {}) => ({
  clientId: 'vila-rosa',
  activeGroupId: 'covenants',
  activeReportId: 'extrato-detalhado',
  semanticContext,
  ...over,
});

beforeEach(() => {
  h.update.mockClear();
  h.get.mockReset().mockReturnValue({
    exists: true,
    data: () => ({
      blockMap: { b1: { metricId: 'chat.extrato' }, b2: { metricId: 'covenants.saldo' } },
      filters: { metricPageFilters: { date_range: { kind: 'date_range', attribute: 'transacoes.data' } } },
    }),
  });
});

describe('add_page_filter', () => {
  it('declara o seletor apontando para o campo do indicador, sem tocar no que já estava lá', async () => {
    const r = await run(createAddPageFilterTool(ctx()), { campo: 'banco' });

    expect(r).toMatchObject({ action: 'page_filter_added', key: 'banco', label: 'Banco' });
    // Caminho pontilhado: escreve só a chave nova, preservando o filtro de tempo.
    expect(h.update).toHaveBeenCalledWith({
      'filters.metricPageFilters.banco': {
        kind: 'in',
        control: 'dropdown',
        label: 'Banco',
        source: { metricId: 'chat.extrato', field: 'banco' },
      },
    });
  });

  it('não grava attribute — quem diz o que comparar é a métrica', async () => {
    await run(createAddPageFilterTool(ctx()), { campo: 'banco' });

    const saved = (h.update.mock.calls[0]![0] as Record<string, Record<string, unknown>>)['filters.metricPageFilters.banco']!;
    expect(saved).not.toHaveProperty('attribute');
    expect(saved).not.toHaveProperty('labelAttribute');
  });

  it('o rótulo pedido pelo usuário vence o sugerido pela métrica', async () => {
    const r = await run(createAddPageFilterTool(ctx()), { campo: 'banco', label: 'Instituição' });

    expect(r.label).toBe('Instituição');
    const saved = (h.update.mock.calls[0]![0] as Record<string, Record<string, unknown>>)['filters.metricPageFilters.banco']!;
    expect(saved.label).toBe('Instituição');
  });

  it('diz quais blocos reagem e quais ignoram', async () => {
    const r = await run(createAddPageFilterTool(ctx()), { campo: 'banco' });

    expect(r.blocosQueReagem).toEqual(['chat.extrato']);
    expect(r.blocosQueIgnoram).toEqual(['covenants.saldo']);
    expect(r.aviso).toContain('chat.extrato');
  });

  /**
   * O caso que originou a ADR: o modelo escolheu `transacoes.pagador_banco`
   * porque a lista que ele via era o contrato inteiro do cliente. Agora a
   * recusa traz os campos DA PÁGINA, e ele se corrige no mesmo turno.
   */
  it('recusa campo que nenhum indicador da página oferece, e lista os que oferece', async () => {
    const r = await run(createAddPageFilterTool(ctx()), { campo: 'pagador_banco' });

    expect(r).toMatchObject({ ok: false, error: 'CAMPO_DESCONHECIDO' });
    expect(r.message).toContain('banco');
    expect(r.camposDisponiveis).toEqual([
      expect.objectContaining({ campo: 'banco', metricId: 'chat.extrato' }),
    ]);
    expect(h.update).not.toHaveBeenCalled();
  });

  /*
   * A lista da recusa incluía os campos que JÁ são seletores, sem dizer que
   * são: o modelo se corrigia escolhendo um deles e levava um segundo "não",
   * agora `FILTRO_JA_EXISTE`. Duas recusas para uma pergunta.
   */
  it('na recusa, marca quais campos já são filtro desta página', async () => {
    const withCategory = {
      ...semanticContext,
      metrics: [
        {
          ...semanticContext.metrics[0],
          filterFields: {
            banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
            categoria: { expr: 'cat.traduzida', field: 'categoria', label: 'Categoria' },
          },
        },
      ],
    };
    h.get.mockReturnValue({
      exists: true,
      data: () => ({
        blockMap: { b1: { metricId: 'chat.extrato' } },
        filters: { metricPageFilters: { banco: { kind: 'in', control: 'dropdown' } } },
      }),
    });

    const r = await run(
      createAddPageFilterTool(ctx({ semanticContext: withCategory })),
      { campo: 'pagador_banco' },
    );

    expect(r.error).toBe('CAMPO_DESCONHECIDO');
    expect(r.message).toMatch(/banco \(já é filtro desta página\)/);
    expect(r.message).toContain('categoria');
    expect(h.update).not.toHaveBeenCalled();
  });

  /**
   * Antes, colisão de chave virava `banco_2` em silêncio — e como nenhuma
   * métrica cita `{filter.banco_2}`, o seletor nascia decorativo. Foi o que
   * aconteceu no primeiro turno do caso real.
   */
  it('recusa quando a página já tem aquele filtro, em vez de inventar banco_2', async () => {
    h.get.mockReturnValue({
      exists: true,
      data: () => ({
        blockMap: { b1: { metricId: 'chat.extrato' } },
        filters: { metricPageFilters: { banco: { kind: 'in', control: 'dropdown', label: 'Banco' } } },
      }),
    });

    const r = await run(createAddPageFilterTool(ctx()), { campo: 'banco' });

    expect(r).toMatchObject({ ok: false, error: 'FILTRO_JA_EXISTE', key: 'banco' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('avisa quando um bloco cita a chave mas não sabe comparar', async () => {
    const withSeries = {
      ...semanticContext,
      metrics: [
        ...semanticContext.metrics,
        {
          id: 'covenants.serie',
          recipe: { kind: 'sql', template: 'SELECT 1 FROM {transacoes} WHERE {filter.banco}' },
        },
      ],
    };
    h.get.mockReturnValue({
      exists: true,
      data: () => ({
        blockMap: { b1: { metricId: 'chat.extrato' }, b3: { metricId: 'covenants.serie' } },
        filters: {},
      }),
    });

    const r = await run(
      createAddPageFilterTool(ctx({ semanticContext: withSeries })),
      { campo: 'banco' },
    );

    expect(r.blocosQueCitamSemComparar).toEqual(['covenants.serie']);
    expect(r.aviso).toContain('covenants.serie');
  });

  it('sem página aberta não há onde declarar filtro', async () => {
    const r = await run(createAddPageFilterTool(ctx({ activeReportId: undefined })), { campo: 'banco' });

    expect(r).toMatchObject({ ok: false, error: 'SEM_PAGINA_ABERTA' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('página que não existe no banco não vira filtro', async () => {
    h.get.mockReturnValue({ exists: false });

    const r = await run(createAddPageFilterTool(ctx()), { campo: 'banco' });

    expect(r).toMatchObject({ ok: false, error: 'PAGINA_NAO_ENCONTRADA' });
    expect(h.update).not.toHaveBeenCalled();
  });
});
