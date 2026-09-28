import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O bug que este arquivo fecha: o usuário pediu "um novo relatório chamado
 * Teste, depois vou criar as páginas" e recebeu uma PÁGINA chamada Teste dentro
 * do relatório que estava aberto. Não havia como acertar — `create_report_page`
 * era a única tool de criação, e relatório (`groups`) não tinha porta nenhuma.
 */

const h = vi.hoisted(() => ({
  groupDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock('@/shared/lib/firebase/admin', () => {
  function collection(path: string) {
    return {
      get: async () => ({ docs: path.endsWith('/groups') ? h.groupDocs : [] }),
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => { h.writes.push({ path: `${path}/${id}`, data }); },
        collection: (sub: string) => collection(`${path}/${id}/${sub}`),
      }),
    };
  }
  return { getDb: () => ({ collection: (name: string) => collection(name) }) };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '<<ts>>' },
}));

import { createCreateReportTool } from './create-report';

type Result = Record<string, unknown>;

async function run(tool: unknown, input: Record<string, unknown>): Promise<Result> {
  const t = tool as { execute: (a: Record<string, unknown>) => Promise<Result> };
  return t.execute(input);
}

const ctx = { clientId: 'vila-rosa' };

beforeEach(() => {
  h.groupDocs = [{ id: 'covenants', data: () => ({ name: 'Covenants', order: 1 }) }];
  h.writes = [];
});

describe('create_report', () => {
  it('cria o relatório com o nome pedido e devolve o id para navegar', async () => {
    const r = await run(createCreateReportTool(ctx), { name: 'Teste' });

    expect(r.action).toBe('report_created');
    expect(r.groupId).toBe('teste');
    expect(r.name).toBe('Teste');
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]!.path).toBe('clients/vila-rosa/groups/teste');
    expect(h.writes[0]!.data).toMatchObject({ name: 'Teste' });
  });

  /*
   * O relatório nasce VAZIO, como nasce pelo botão "Novo relatório" da barra
   * lateral. "Depois vou criar as páginas" é o usuário dizendo que o próximo
   * passo é dele; criar uma página junto devolveria exatamente o excesso que
   * originou o bug.
   */
  it('não cria página nenhuma dentro do relatório novo', async () => {
    await run(createCreateReportTool(ctx), { name: 'Teste' });
    expect(h.writes.filter((e) => e.path.includes('/reports/'))).toHaveLength(0);
  });

  /**
   * Escopo de tenant é server-bound (ADR-0006): o `clientId` vem do contexto do
   * servidor. Um `clientId` no input é entrada hostil.
   */
  it('ignora clientId vindo do input e usa o do contexto', async () => {
    await run(createCreateReportTool(ctx), { name: 'Teste', clientId: 'outro-tenant' });
    expect(h.writes[0]!.path).toContain('clients/vila-rosa/');
    expect(h.writes[0]!.path).not.toContain('outro-tenant');
  });

  it('recusa nome vazio sem escrever nada', async () => {
    const r = await run(createCreateReportTool(ctx), { name: '   ' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NOME_OBRIGATORIO');
    expect(h.writes).toHaveLength(0);
  });

  it('sem tenant no contexto não escreve', async () => {
    const r = await run(createCreateReportTool({ clientId: undefined }), { name: 'Teste' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('SEM_TENANT');
    expect(h.writes).toHaveLength(0);
  });

  // `doc(id).set()` sobre id existente SUBSTITUI o documento — colidir aqui
  // apagaria o relatório do homônimo, com as páginas dele órfãs.
  it('desambigua o id quando já existe relatório de mesmo nome', async () => {
    h.groupDocs = [{ id: 'teste', data: () => ({ name: 'Teste', order: 1 }) }];
    const r = await run(createCreateReportTool(ctx), { name: 'Teste' });
    expect(r.groupId).toBe('teste-2');
    expect(h.writes[0]!.path).toBe('clients/vila-rosa/groups/teste-2');
  });

  it('coloca o relatório no fim do seletor', async () => {
    h.groupDocs = [
      { id: 'a', data: () => ({ order: 3 }) },
      { id: 'b', data: () => ({ order: 7 }) },
    ];
    await run(createCreateReportTool(ctx), { name: 'Teste' });
    expect(h.writes[0]!.data.order).toBe(8);
  });

  it('primeiro relatório do cliente é criado sem erro', async () => {
    h.groupDocs = [];
    const r = await run(createCreateReportTool(ctx), { name: 'Teste' });
    expect(r.action).toBe('report_created');
    expect(h.writes[0]!.data.order).toBe(1);
  });
});
