import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  descriptive: vi.fn(), diagnostic: vi.fn(), predictive: vi.fn(), prescriptive: vi.fn(),
  monitoring: vi.fn(), simulation: vi.fn(), external: vi.fn(), cashflow: vi.fn(),
  agentsArg: undefined as unknown,
}));
vi.mock('./descriptive-agent-mastra', () => ({ createDescriptiveAgentMastra: h.descriptive }));
vi.mock('./diagnostic-agent-mastra', () => ({ createDiagnosticAgentMastra: h.diagnostic }));
vi.mock('./predictive-agent-mastra', () => ({ createPredictiveAgentMastra: h.predictive }));
vi.mock('./prescriptive-agent-mastra', () => ({ createPrescriptiveAgentMastra: h.prescriptive }));
vi.mock('./monitoring-agent-mastra', () => ({ createMonitoringAgentMastra: h.monitoring }));
vi.mock('./simulation-agent-mastra', () => ({ createSimulationAgentMastra: h.simulation }));
vi.mock('./external-agent-mastra', () => ({ createExternalAgentMastra: h.external }));
vi.mock('./cashflow-agent-mastra', () => ({ createCashflowAgentMastra: h.cashflow }));
vi.mock('@mastra/core', () => ({ Mastra: vi.fn(function (cfg: { agents: unknown }) { h.agentsArg = cfg.agents; return { cfg }; }) }));

import { buildMastraInstance } from './instance';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => {
  Object.entries(h).forEach(([k, v]) => { if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(`AGENT_${k}`); });
  h.agentsArg = undefined;
});

describe('buildMastraInstance', () => {
  it('registra os 8 agentes', async () => {
    await buildMastraInstance({ ctx });
    expect(Object.keys(h.agentsArg as object).sort()).toEqual(
      ['cashflow', 'descriptive', 'diagnostic', 'external', 'monitoring', 'predictive', 'prescriptive', 'simulation'],
    );
  });

  it('fail-soft: um factory que lança não impede os outros', async () => {
    h.diagnostic.mockRejectedValueOnce(new Error('boom'));
    await buildMastraInstance({ ctx });
    const agents = h.agentsArg as Record<string, unknown>;
    expect(agents.diagnostic).toBeUndefined();
    expect(agents.descriptive).toBe('AGENT_descriptive');
    expect(Object.keys(agents)).toHaveLength(7);
  });
});
