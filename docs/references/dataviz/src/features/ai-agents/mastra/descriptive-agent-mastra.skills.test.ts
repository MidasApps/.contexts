import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  resolveCapsMock: vi.fn(),
  buildFromKeysMock: vi.fn(),
  loadAgentConfigMock: vi.fn(),
  createKbToolMock: vi.fn(),
  resolveInstrMock: vi.fn(),
}));

vi.mock('@/features/ai-studio/runtime/resolve-capabilities', () => ({ resolveAgentCapabilities: h.resolveCapsMock }));
vi.mock('@/features/ai-studio/runtime/tool-registry', () => ({ buildToolsFromKeys: h.buildFromKeysMock }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock }));
vi.mock('@/features/ai-studio/runtime/kb-retrieval-tool', () => ({ createKbRetrievalTool: h.createKbToolMock }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/shared/config/agents', () => ({
  buildDescriptiveStatic: () => 'STATIC',
  SQL_RULES: 'SQL', RESPONSE_GUIDELINES: 'RESP',
  buildBusinessContext: () => 'BIZ',
}));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => 'model', MAX_MODEL_RETRIES: 5 }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildAgentDynamicContext: () => 'DYN' }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));
vi.mock('@/shared/config/agents/default-agent-tools', () => ({
  DEFAULT_AGENT_TOOLS: { descriptive: ['execute_sql', 'lookup_glossary'] },
}));

import { createDescriptiveAgentMastra } from './descriptive-agent-mastra';
import { Agent } from '@mastra/core/agent';

const ctx = { clientId: 'OM', personaId: 'p', dataset: {}, filters: {}, sessionId: 's' } as never;

function lastAgentTools() {
  const cfg = (Agent as unknown as { mock: { calls: Array<[{ tools: Record<string, unknown> }]> } }).mock.calls.at(-1)![0];
  return cfg.tools;
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('INSTR');
  h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({ execute_sql: 'BASE_sql', lookup_glossary: 'BASE_gloss' });
  h.loadAgentConfigMock.mockResolvedValue(null);
  (Agent as unknown as { mockClear: () => void }).mockClear();
});

describe('descriptive Mastra — Fase 3 skills wiring', () => {
  it('tools base (não-regressão): buildToolsFromKeys chamado com DEFAULT quando toolKeys vazio', async () => {
    await createDescriptiveAgentMastra({ ctx });
    expect(h.resolveCapsMock).toHaveBeenCalledWith('descriptive');
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['execute_sql', 'lookup_glossary', 'get_table_schema'], ctx, 'descriptive');
    expect(lastAgentTools()).toEqual({ execute_sql: 'BASE_sql', lookup_glossary: 'BASE_gloss' });
  });

  it('toolKeys concedidos → buildToolsFromKeys chamado com caps.toolKeys', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['vector_query'], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ vector_query: 'GRANTED_vector' });
    await createDescriptiveAgentMastra({ ctx });
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['vector_query'], ctx, 'descriptive');
    const tools = lastAgentTools();
    expect(tools.vector_query).toBe('GRANTED_vector');
  });

  it('kbRefs agent ∪ skill → kb tool recebe union deduplicada', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ knowledgeBaseRefs: ['kb-prod'] });
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: ['kb-mercado', 'kb-prod'] });
    h.createKbToolMock.mockReturnValue('KB_TOOL');
    await createDescriptiveAgentMastra({ ctx });
    const arg = h.createKbToolMock.mock.calls.at(-1)![0];
    expect([...arg.knowledgeBaseRefs].sort()).toEqual(['kb-mercado', 'kb-prod']);
    expect(lastAgentTools().kb_retrieval).toBe('KB_TOOL');
  });
});
