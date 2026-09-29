import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ helperMock: vi.fn(), staticMock: vi.fn(() => 'STATIC') }));
vi.mock('./create-mastra-agent-from-config', () => ({ createMastraAgentFromConfig: h.helperMock }));
vi.mock('@/shared/config/agents', () => ({ buildCashflowStatic: h.staticMock }));

import { createCashflowAgentMastra } from './cashflow-agent-mastra';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => { h.helperMock.mockReset().mockResolvedValue({ id: 'cashflow_agent' }); });

describe('createCashflowAgentMastra', () => {
  it('chama o helper com systemKey/name/description/defaultModelTier/buildStatic/ctx corretos', async () => {
    await createCashflowAgentMastra({ ctx });
    const arg = h.helperMock.mock.calls.at(-1)![0];
    expect(arg.systemKey).toBe('cashflow');
    expect(arg.name).toBe('Cashflow Agent');
    expect(arg.description).toBe('Analisa fluxo de caixa: WAL, excess spread, cobertura, comparação esperado vs contratado e decomposição de pagamentos.');
    expect(arg.defaultModelTier).toBe('fast');
    expect(arg.buildStatic).toBe(h.staticMock);
    expect(arg.ctx).toBe(ctx);
    expect(arg.buildToolsFactory).toBeUndefined();
  });
});
