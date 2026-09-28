/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadWorkflowsMock: vi.fn(), selectWorkflowMock: vi.fn(), buildSupervisorMock: vi.fn() }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadWorkflows: h.loadWorkflowsMock }));
vi.mock('@/features/ai-studio/runtime/select-workflow', () => ({ selectWorkflow: h.selectWorkflowMock }));
vi.mock('@/features/ai-agents/mastra/build-supervisor-agent', () => ({ buildSupervisorAgent: h.buildSupervisorMock }));
import { resolveChatAgent, lastUserText } from '../resolve-chat-agent';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
function fakeMastra(agents: Record<string, unknown>) {
  return { getAgent: (k: string) => { const a = agents[k]; if (!a) throw new Error('no agent'); return a; } } as never;
}
const messages = [{ role: 'user', parts: [{ type: 'text', text: 'inadimplência subiu?' }] }] as never;
beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('lastUserText', () => {
  it('extrai a última mensagem de user', () => {
    expect(lastUserText([{ role: 'user', parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] as never)).toBe('a b');
  });
});

/**
 * O supervisor é o produto: ele traz os 8 sub-agentes E as tools de autoria. O
 * workflow contribui com uma seção do prompt, não com capacidade — então perder
 * o workflow não pode custar a autoria.
 */
describe('resolveChatAgent', () => {
  it('workflows ativos → supervisor com a instrução do Firestore', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC', diagnostic: 'DIAG' });
    h.loadWorkflowsMock.mockResolvedValueOnce([{ id: 'default', isDefault: true, instruction: 'WF', status: 'active' }]);
    h.selectWorkflowMock.mockResolvedValueOnce({ id: 'default', instruction: 'WF' });
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('SUPERVISOR');
    expect(h.buildSupervisorMock.mock.calls.at(-1)![0].instruction).toBe('WF');
  });

  // A coleção é editável pelo admin: desativar o único doc bastava para o
  // produto perder o supervisor e as tools de autoria, em silêncio.
  it('sem workflow ativo → supervisor com a instrução baseline do código', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('SUPERVISOR');
    expect(h.buildSupervisorMock.mock.calls.at(-1)![0].instruction).toMatch(/Construir ou alterar/i);
  });

  it('falha ao carregar workflow não custa a autoria', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockRejectedValueOnce(new Error('down'));
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('SUPERVISOR');
  });

  it('workflow sem instrução usa a baseline em vez de prompt vazio', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([{ id: 'x', status: 'active' }]);
    h.selectWorkflowMock.mockResolvedValueOnce({ id: 'x', instruction: '   ' });
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    await resolveChatAgent({ mastra, ctx, messages });
    expect(h.buildSupervisorMock.mock.calls.at(-1)![0].instruction.length).toBeGreaterThan(100);
  });

  // Fail-soft de verdade: só quando o supervisor não constrói.
  it('supervisor que não constrói → descriptive, com log de erro', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockRejectedValueOnce(new Error('sem modelo'));
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('DESC');
  });
});

/**
 * O seletor de agente do painel. Escolher um especialista é atalho: fala-se com
 * ele direto, sem o supervisor no caminho — e sem as tools de autoria, que são
 * do supervisor.
 */
describe('resolveChatAgent — agente escolhido à mão', () => {
  it('especialista escolhido atende a requisição, sem montar supervisor', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC', diagnostic: 'DIAG' });
    expect(await resolveChatAgent({ mastra, ctx, messages, agentId: 'diagnostic' })).toBe('DIAG');
    expect(h.buildSupervisorMock).not.toHaveBeenCalled();
    expect(h.loadWorkflowsMock).not.toHaveBeenCalled();
  });

  it('agentId do supervisor segue o caminho normal', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages, agentId: 'orchestrator' })).toBe('SUPERVISOR');
  });

  // Body é entrada externa: id inventado não pode escolher agente nenhum.
  it('agentId desconhecido cai no supervisor', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC', 'agente-secreto': 'SECRETO' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages, agentId: 'agente-secreto' })).toBe('SUPERVISOR');
  });

  // O especialista pode não ter subido (fail-soft por agente na instance).
  it('especialista que não subiu não derruba a conversa — supervisor atende', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages, agentId: 'cashflow' })).toBe('SUPERVISOR');
  });
});

/**
 * Quem atendeu o turno não aparecia em lugar nenhum.
 *
 * O usuário pediu "crie um novo relatório chamado Teste 2", recebeu "criei o
 * relatório Teste 2" e nada foi escrito no Firestore. Dois caminhos servem o
 * chat SEM tools de autoria — especialista escolhido no seletor (que é
 * persistido entre sessões) e o fallback `descriptive` — e no primeiro o log
 * fica em silêncio absoluto. Sem saber qual agente atendeu, não há como
 * distinguir "o modelo não chamou a tool" de "o turno não tinha a tool", e as
 * duas causas pedem correções opostas.
 */
describe('resolveChatAgent — quem atendeu o turno fica no log', () => {
  function captureLogs() {
    const lines: Array<Record<string, unknown>> = [];
    const capture = (arg: unknown) => {
      try { lines.push(JSON.parse(String(arg))); } catch { /* linha não-JSON */ }
    };
    vi.spyOn(console, 'info').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    return {
      lines,
      resolution: () => lines.find((l) => l.msg === 'chat_agent_resolvido'),
    };
  }

  it('supervisor: registra o agente e que o turno tem autoria', async () => {
    const log = captureLogs();
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');

    await resolveChatAgent({ mastra, ctx, messages });

    expect(log.resolution()).toMatchObject({ agente: 'orchestrator', autoria: true });
  });

  /*
   * É o caso silencioso: o seletor é persistido, então quem escolheu um
   * especialista um dia segue sem autoria em toda conversa seguinte — e o
   * modelo, sem tool, ainda responde que criou.
   */
  it('especialista escolhido: registra que o turno NÃO pode criar nada', async () => {
    const log = captureLogs();
    const mastra = fakeMastra({ cashflow: 'CASHFLOW' });

    expect(await resolveChatAgent({ mastra, ctx, messages, agentId: 'cashflow' })).toBe('CASHFLOW');

    expect(log.resolution()).toMatchObject({ agente: 'cashflow', autoria: false });
  });

  it('fallback descriptive: registra que o turno NÃO pode criar nada', async () => {
    const log = captureLogs();
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    h.buildSupervisorMock.mockRejectedValueOnce(new Error('supervisor caiu'));

    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('DESC');

    expect(log.resolution()).toMatchObject({ agente: 'descriptive', autoria: false });
  });
});
