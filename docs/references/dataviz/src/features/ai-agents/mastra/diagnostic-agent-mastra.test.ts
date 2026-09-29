import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ helperMock: vi.fn(), staticMock: vi.fn(() => 'STATIC') }));
vi.mock('./create-mastra-agent-from-config', () => ({ createMastraAgentFromConfig: h.helperMock }));
vi.mock('@/shared/config/agents', () => ({ buildDiagnosticStatic: h.staticMock }));

import { createDiagnosticAgentMastra } from './diagnostic-agent-mastra';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => { h.helperMock.mockReset().mockResolvedValue({ id: 'diagnostic_agent' }); });

describe('createDiagnosticAgentMastra', () => {
  it('chama o helper com systemKey/defaultModelTier/buildStatic/ctx corretos', async () => {
    await createDiagnosticAgentMastra({ ctx });
    const arg = h.helperMock.mock.calls.at(-1)![0];
    expect(arg.systemKey).toBe('diagnostic');
    expect(arg.defaultModelTier).toBe('reasoning');
    expect(arg.buildStatic).toBe(h.staticMock);
    expect(arg.ctx).toBe(ctx);
    expect(arg.buildToolsFactory).toBeUndefined();
  });
});
