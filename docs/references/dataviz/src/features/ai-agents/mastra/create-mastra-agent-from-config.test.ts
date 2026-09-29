import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({
  resolveCapsMock: vi.fn(), buildFromKeysMock: vi.fn(), loadAgentConfigMock: vi.fn(),
  createKbToolMock: vi.fn(), resolveInstrMock: vi.fn(), getModelMock: vi.fn(), dynMock: vi.fn(),
}));
vi.mock('@/features/ai-studio/runtime/resolve-capabilities', () => ({ resolveAgentCapabilities: h.resolveCapsMock }));
vi.mock('@/features/ai-studio/runtime/tool-registry', () => ({ buildToolsFromKeys: h.buildFromKeysMock }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock }));
vi.mock('@/features/ai-studio/runtime/kb-retrieval-tool', () => ({ createKbRetrievalTool: h.createKbToolMock }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: h.getModelMock, MAX_MODEL_RETRIES: 5 }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildAgentDynamicContext: h.dynMock }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));
vi.mock('@/shared/config/agents/default-agent-tools', () => ({ DEFAULT_AGENT_TOOLS: { diagnostic: ['execute_sql'] } }));

import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';
import { Agent } from '@mastra/core/agent';

const ctx = { clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's' } as never;
function lastCfg() { return (Agent as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls.at(-1)![0] as { id: string; instructions: string; tools: Record<string, unknown>; model: unknown; name: string; description: string }; }
function input(over = {}) {
  return { systemKey: 'diagnostic', name: 'Diag', description: 'desc', defaultModelTier: 'reasoning', buildStatic: () => 'STATIC', ctx, ...over } as never;
}
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('INSTR'); h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({}); h.loadAgentConfigMock.mockResolvedValue(null);
  h.getModelMock.mockReturnValue('MODEL'); h.dynMock.mockReturnValue('DYNAMIC');
  (Agent as unknown as { mockClear: () => void }).mockClear();
});

describe('createMastraAgentFromConfig', () => {
  it('instructions = resolve + dynamic anexado; id correto', async () => {
    h.buildFromKeysMock.mockReturnValue({ execute_sql: 'BASE' });
    await createMastraAgentFromConfig(input());
    expect(h.resolveCapsMock).toHaveBeenCalledWith('diagnostic');
    expect(h.resolveInstrMock).toHaveBeenCalledWith('diagnostic', expect.stringContaining('STATIC'));
    const cfg = lastCfg();
    expect(cfg.id).toBe('diagnostic_agent');
    expect(cfg.instructions).toBe('INSTR\n\nDYNAMIC');
    expect(cfg.tools).toEqual({ execute_sql: 'BASE' });
  });
  it('model = getModel(cfg.model) quando config define tier', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ model: 'fast' });
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('fast');
  });
  it('model = getModel(defaultModelTier) quando config ausente', async () => {
    h.loadAgentConfigMock.mockResolvedValue(null);
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('reasoning');
  });
  it('model = getModel(defaultModelTier) quando cfg.model é tier inválido (e.g. "slow")', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ model: 'slow' });
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('reasoning');
  });
  it('model = getModel("flash") quando cfg.model é "flash" (tier válido)', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ model: 'flash' });
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('flash');
  });
  it('kbRefs (agent ∪ skill) → kb_retrieval', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ knowledgeBaseRefs: ['kb-prod'] });
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: ['kb-mercado'] });
    h.createKbToolMock.mockReturnValue('KB');
    await createMastraAgentFromConfig(input());
    const arg = h.createKbToolMock.mock.calls.at(-1)![0];
    expect([...arg.knowledgeBaseRefs].sort()).toEqual(['kb-mercado', 'kb-prod']);
    expect(lastCfg().tools.kb_retrieval).toBe('KB');
  });
  it('config vazia → usa DEFAULT_AGENT_TOOLS[systemKey]', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ execute_sql: 'BASE' });
    await createMastraAgentFromConfig(input());
    // buildToolsFromKeys chamado com a lista DEFAULT (['execute_sql']) e systemKey,
    // mais get_table_schema: quem roda SQL sempre ganha a tool de schema.
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['execute_sql', 'get_table_schema'], ctx, 'diagnostic');
  });
  it('config gravada sem get_table_schema → o agente que roda SQL recebe a tool', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['dry_run_sql', 'execute_sql', 'run_clustering'], kbRefs: [] });
    await createMastraAgentFromConfig(input());
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(
      ['dry_run_sql', 'execute_sql', 'run_clustering', 'get_table_schema'], ctx, 'diagnostic',
    );
  });
  it('config com toolRefs → usa caps.toolKeys', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['calculate_hhi'], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ calculate_hhi: 'GRANTED' });
    await createMastraAgentFromConfig(input());
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['calculate_hhi'], ctx, 'diagnostic');
  });
  it('com schema do cliente: baseline de código omite o hardcoded', async () => {
    const scCtx = {
      clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's',
      semanticContext: {
        clientId: 'OM', metrics: [],
        dataContracts: [{ contractId: 'c', entities: [{ entityId: 'contratos', attributes: [{ attributeId: 'saldo_devedor', type: 'float', column: 'vl_saldo_dev' }] }] }],
      },
    } as never;
    await createMastraAgentFromConfig(input({ ctx: scCtx }));
    const baseline = h.resolveInstrMock.mock.calls.at(-1)![1] as string;
    expect(baseline).not.toContain('## Schema: Tabela contratos');
  });
  // Invertido junto com a remoção do fallback: o baseline de código não carrega
  // mais schema de tabela. Cliente sem os próprios bindings recebe prompt sem
  // schema — não o schema de outro cliente.
  it('baseline de código não injeta schema de tabela', async () => {
    await createMastraAgentFromConfig(input());
    const baseline = h.resolveInstrMock.mock.calls.at(-1)![1] as string;
    expect(baseline).not.toContain('## Schema: Tabela contratos');
  });
});
