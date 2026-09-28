import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
  groupDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}));

vi.mock('@/shared/lib/firebase/admin', () => {
  function collection(path: string) {
    const isGroups = path.endsWith('/groups');
    return {
      get: async () => ({ docs: isGroups ? h.groupDocs : h.docs }),
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

import { createCreateReportPageTool } from './create-report-page';

type Result = Record<string, unknown>;

async function run(tool: unknown, input: Record<string, unknown>): Promise<Result> {
  const t = tool as { execute: (a: Record<string, unknown>) => Promise<Result> };
  return t.execute(input);
}

const ctx = { clientId: 'vila-rosa' };

beforeEach(() => {
  h.docs = [];
  h.writes = [];
  h.groupDocs = [{ id: 'covenants', data: () => ({ name: 'Covenants', order: 1 }) }];
});

describe('create_report_page', () => {
  it('cria a página com o nome pedido e devolve os ids para navegar', async () => {
    const r = await run(createCreateReportPageTool(ctx), { name: 'Teste' });

    expect(r.action).toBe('report_page_created');
    expect(r.reportId).toBe('teste');
    expect(r.groupId).toBe('covenants');
    expect(r.name).toBe('Teste');
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]!.path).toBe('clients/vila-rosa/groups/covenants/reports/teste');
    expect(h.writes[0]!.data).toMatchObject({ name: 'Teste', blockMap: {}, layout: [] });
  });

  /**
   * Escopo de tenant é server-bound (ADR-0006): o `clientId` vem do contexto do
   * servidor. Um `clientId` no input é entrada hostil — o modelo pode ser
   * induzido a emiti-lo por injeção no texto do usuário.
   */
  it('ignora clientId vindo do input e usa o do contexto', async () => {
    await run(createCreateReportPageTool(ctx), { name: 'Teste', clientId: 'outro-tenant' });
    expect(h.writes[0]!.path).toContain('clients/vila-rosa/');
    expect(h.writes[0]!.path).not.toContain('outro-tenant');
  });

  it('recusa nome vazio sem escrever nada', async () => {
    const r = await run(createCreateReportPageTool(ctx), { name: '   ' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('NOME_OBRIGATORIO');
    expect(h.writes).toHaveLength(0);
  });

  it('sem tenant no contexto não escreve', async () => {
    const r = await run(createCreateReportPageTool({ clientId: undefined }), { name: 'Teste' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('SEM_TENANT');
    expect(h.writes).toHaveLength(0);
  });

  // O id do documento é o último segmento da URL — dois "Teste" não podem
  // colidir, senão a página nova sobrescreveria a antiga.
  it('desambigua o id quando já existe página de mesmo nome', async () => {
    h.docs = [{ id: 'teste', data: () => ({ order: 1 }) }];
    const r = await run(createCreateReportPageTool(ctx), { name: 'Teste' });
    expect(r.reportId).toBe('teste-2');
  });

  it('coloca a página no fim da lista', async () => {
    h.docs = [
      { id: 'a', data: () => ({ order: 3 }) },
      { id: 'b', data: () => ({ order: 7 }) },
    ];
    await run(createCreateReportPageTool(ctx), { name: 'Teste' });
    expect(h.writes[0]!.data.order).toBe(8);
  });

  /*
   * O caso que quebrou em produção: o usuário estava em "Covenants", pediu uma
   * página, e ela nasceu dentro de "Relatório Teste" — o primeiro da coleção
   * por ordem de id, sem relação nenhuma com o que estava na tela.
   */
  it('sem groupId no pedido, cria no relatório que o usuário tem aberto', async () => {
    h.groupDocs = [
      { id: 'aaa-relatorio-teste', data: () => ({ name: 'Relatório Teste' }) },
      { id: 'covenants', data: () => ({ name: 'Covenants' }) },
    ];
    const r = await run(
      createCreateReportPageTool({ clientId: 'vila-rosa', activeGroupId: 'covenants' }),
      { name: 'Projeção de Fluxo' },
    );
    expect(r.groupId).toBe('covenants');
  });

  // Pedido explícito vence o relatório aberto: "crie no Covenants" é endereço.
  it('groupId do pedido vence o relatório aberto', async () => {
    h.groupDocs = [
      { id: 'covenants', data: () => ({ name: 'Covenants' }) },
      { id: 'analises', data: () => ({ name: 'Análises' }) },
    ];
    const r = await run(
      createCreateReportPageTool({ clientId: 'vila-rosa', activeGroupId: 'covenants' }),
      { name: 'Teste', groupId: 'analises' },
    );
    expect(r.groupId).toBe('analises');
  });

  // Id que não existe no cliente não pode virar endereço de escrita.
  it('relatório aberto inexistente é ignorado — cai no primeiro', async () => {
    h.groupDocs = [
      { id: 'covenants', data: () => ({ name: 'Covenants' }) },
      { id: 'analises', data: () => ({ name: 'Análises' }) },
    ];
    const r = await run(
      createCreateReportPageTool({ clientId: 'vila-rosa', activeGroupId: 'de-outro-cliente' }),
      { name: 'Teste' },
    );
    expect(r.groupId).toBe('covenants');
  });

  it('aceita grupo explícito quando informado', async () => {
    h.groupDocs = [
      { id: 'covenants', data: () => ({ order: 1 }) },
      { id: 'analises', data: () => ({ order: 2 }) },
    ];
    const r = await run(createCreateReportPageTool(ctx), { name: 'Teste', groupId: 'analises' });
    expect(r.groupId).toBe('analises');
    expect(h.writes[0]!.path).toContain('/groups/analises/');
  });

  // Sem grupo nenhum o tenant ainda não foi provisionado; criar um grupo aqui
  // seria decisão de estrutura escondida numa tool de página.
  it('sem grupo no cliente, falha explicando em vez de inventar estrutura', async () => {
    h.groupDocs = [];
    const r = await run(createCreateReportPageTool(ctx), { name: 'Teste' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('SEM_GRUPO');
    expect(h.writes).toHaveLength(0);
  });

  it('guarda a descrição quando informada', async () => {
    await run(createCreateReportPageTool(ctx), { name: 'Teste', description: 'Volumetria de contratos' });
    expect(h.writes[0]!.data.description).toBe('Volumetria de contratos');
  });
});
