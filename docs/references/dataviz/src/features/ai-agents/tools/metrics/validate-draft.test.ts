import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  bindings: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('@/shared/lib/metrics/execute-metric', () => ({
  loadClientBindings: (...a: unknown[]) => h.bindings(...a),
  executeMetric: (...a: unknown[]) => h.exec(...a),
  newMetricExecCaches: () => ({}),
}));

import { validateDraft } from './validate-draft';

const draft = {
  clientId: 'vila-rosa',
  label: 'Vendas por mês',
  sql: 'SELECT {contratos.data} AS bucket, COUNT(*) AS value FROM {contratos} GROUP BY 1',
  requires: ['liquid-play.contratos.data'],
  shape: 'timeseries' as const,
};

/** Dry-run devolve schema; a amostra devolve linhas. */
function responses(rows: unknown[]) {
  let call = 0;
  h.exec.mockImplementation(async () => {
    call += 1;
    return call === 1
      ? { ok: true, metricId: 'chat.rascunho', data: [], sql: 'SELECT ...', outputColumns: ['bucket', 'value'] }
      : { ok: true, metricId: 'chat.rascunho', data: rows, sql: 'SELECT ...', outputColumns: ['bucket', 'value'] };
  });
}

beforeEach(() => {
  h.bindings.mockReset().mockResolvedValue({ ok: true, bindings: [{ productId: 'p', datasets: [] }] });
  h.exec.mockReset();
  responses([{ bucket: '2026-01', value: 12 }]);
});

describe('validateDraft', () => {
  it('aprova o rascunho e devolve as colunas que o BigQuery previu', async () => {
    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: true, outputColumns: ['bucket', 'value'] });
    expect(r.ok && r.aviso).toBeFalsy();
    expect(h.exec).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true }));
  });

  /**
   * Compilar prova que a query é SQL válido; não prova que ela devolve número.
   * `SAFE_CAST(coluna_texto AS FLOAT64)` compila, roda e devolve null em toda
   * linha — visto no primeiro uso real da ferramenta.
   */
  it('avisa (sem reprovar) quando a consulta roda e devolve só nulo', async () => {
    responses([{ bucket: '2026-01', value: null }, { bucket: '2026-02', value: null }]);

    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toMatch(/nulo em todas as linhas/);
  });

  it('avisa (sem reprovar) quando a consulta não devolve linha nenhuma', async () => {
    responses([]);

    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toMatch(/nenhuma linha/);
  });

  it('a amostra roda de verdade — sem dryRun — e uma vez só', async () => {
    await validateDraft({ draft, email: 'u@e.com' });

    expect(h.exec).toHaveBeenCalledTimes(2);
    const second = h.exec.mock.calls[1]![0] as { dryRun?: boolean };
    expect(second.dryRun).toBeUndefined();
  });

  it('para no template e nem chega ao BigQuery quando a tabela é literal', async () => {
    const r = await validateDraft({
      draft: { ...draft, sql: 'SELECT 1 AS value FROM `proj.ds.tab`' },
      email: 'u@e.com',
    });

    expect(r).toMatchObject({ ok: false, etapa: 'template' });
    expect(h.exec).not.toHaveBeenCalled();
  });

  it('para no documento quando a ref não tem forma de ref', async () => {
    const r = await validateDraft({
      draft: { ...draft, requires: ['contratos'] },
      email: 'u@e.com',
    });

    expect(r).toMatchObject({ ok: false, etapa: 'documento' });
    if (!r.ok) expect(r.error).toContain('requires');
    expect(h.exec).not.toHaveBeenCalled();
  });

  it('repassa o erro do compilador quando a query não compila', async () => {
    h.exec.mockResolvedValue({ ok: false, metricId: 'x', status: 422, error: 'Unrecognized name: saldo_devedr' });

    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: false, etapa: 'compilacao' });
    if (!r.ok) expect(r.error).toContain('saldo_devedr');
  });

  /**
   * O caso que motiva a etapa: a query roda, o BigQuery aceita, e mesmo assim o
   * bloco renderizaria vazio — porque o KPI lê `value` e a query devolve `total`.
   */
  it('recusa colunas que não servem à forma declarada, mesmo com a query válida', async () => {
    h.exec.mockResolvedValue({ ok: true, metricId: 'x', data: [], sql: 's', outputColumns: ['total'] });

    const r = await validateDraft({
      draft: { ...draft, shape: 'scalar', sql: 'SELECT COUNT(*) AS total FROM {contratos}' },
      email: 'u@e.com',
    });

    expect(r).toMatchObject({ ok: false, etapa: 'colunas' });
    if (!r.ok) expect(r.error).toContain('value');
  });

  it('avisa quando o cliente não tem binding em vez de tentar compilar', async () => {
    h.bindings.mockResolvedValue({ ok: false, status: 422, error: 'Cliente "x" sem productBindings configurado' });

    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: false, etapa: 'compilacao' });
    expect(h.exec).not.toHaveBeenCalled();
  });

  /**
   * Sem filtro de página simulado, `{filter.date_range}` vira `1=1` e a coluna
   * de data nunca é resolvida: a métrica passaria na validação e quebraria ao
   * abrir a página, que é onde o filtro chega de verdade.
   */
  it('simula os filtros de página, para a cláusula de data ser resolvida agora', async () => {
    await validateDraft({ draft, email: 'u@e.com' });

    const args = h.exec.mock.calls[0]![0] as { pageFilters?: Record<string, { kind: string }> };
    expect(args.pageFilters?.date_range?.kind).toBe('date_range');
    expect(args.pageFilters?.ate?.kind).toBe('ate');
  });

  it('valida a métrica existente com o id dela — posse e rota valem na edição', async () => {
    await validateDraft({ draft, email: 'u@e.com', metricId: 'chat.vendas_por_mes' });

    expect(h.exec).toHaveBeenCalledWith(
      expect.objectContaining({ metric: expect.objectContaining({ id: 'chat.vendas_por_mes' }) }),
    );
  });

  it('dry-run reprovado (ex.: script) não chega à execução de amostra', async () => {
    h.exec.mockReset().mockResolvedValueOnce({
      ok: false, metricId: 'chat.rascunho', status: 422,
      error: 'A consulta precisa ser um único SELECT; o BigQuery a classificou como SCRIPT.',
    });

    const r = await validateDraft({ draft, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: false, etapa: 'compilacao' });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it('o payload de comentário terminado em CR é recusado já na guarda do template', async () => {
    const r = await validateDraft({
      draft: { ...draft, sql: 'SELECT 1 AS value FROM {contratos} --\r; DELETE FROM contratos WHERE TRUE' },
      email: 'u@e.com',
    });

    expect(r).toMatchObject({ ok: false, etapa: 'template' });
    expect(h.exec).not.toHaveBeenCalled();
  });

  // ADR-0033: percentual multiplicado por 100 sem declarar a coluna quebraria o KPI.
  it('para na escala quando a consulta multiplica por 100 sem declarar pontos', async () => {
    const sql = 'SELECT {contratos.data} AS bucket, 100 * SAFE_DIVIDE(COUNT(*), 10) AS value FROM {contratos} GROUP BY 1';

    const r = await validateDraft({ draft: { ...draft, sql }, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: false, etapa: 'escala' });
    expect(h.exec).toHaveBeenCalledTimes(1);
  });

  it('aprova e devolve a declaração conferida quando a coluna em pontos existe', async () => {
    const sql = 'SELECT {contratos.data} AS bucket, 100 * SAFE_DIVIDE(COUNT(*), 10) AS value FROM {contratos} GROUP BY 1';

    const r = await validateDraft({ draft: { ...draft, sql, percentPointColumns: ['value'] }, email: 'u@e.com' });

    expect(r).toMatchObject({ ok: true, percentPointColumns: ['value'] });
  });
});
