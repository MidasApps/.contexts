import { describe, it, expect, vi, beforeEach } from 'vitest';

const getWMMock = vi.fn();
const setWMMock = vi.fn();
vi.mock('@/shared/lib/memory/memory-service', () => ({
  getWorkingMemory: getWMMock,
  setWorkingMemory: setWMMock,
}));

const baseWM = {
  clientId: 'OM',
  personaId: 'originador',
  icpId: 'icp-1',
  productType: 'MCMV',
  briefing: 'b',
  activeDashboardId: null,
  pages: [],
  blocks: [],
  decisions: [],
  pendingQuestions: [],
};

describe('updateWorkingMemory tool', () => {
  beforeEach(() => {
    getWMMock.mockReset();
    setWMMock.mockReset();
  });

  it('merges patch with current and persists', async () => {
    getWMMock.mockResolvedValueOnce(baseWM);
    setWMMock.mockImplementation(async (_t, p) => p);

    const { createUpdateWorkingMemoryTool } = await import('./update-working-memory');
    const tool = createUpdateWorkingMemoryTool({ threadId: 't-1' });

    const result = (await tool.execute!(
      { patch: { briefing: 'novo brief', pendingQuestions: ['q1'] } },
      { toolCallId: 'tc-1', messages: [] } as never
    )) as { ok: true; persisted: boolean };

    expect(setWMMock).toHaveBeenCalledOnce();
    const [, payload] = setWMMock.mock.calls[0];
    expect(payload.briefing).toBe('novo brief');
    expect(payload.pendingQuestions).toEqual(['q1']);
    expect(payload.clientId).toBe('OM');
    expect(result.ok).toBe(true);
  });

  it('rejects patches that violate eviction limits', async () => {
    getWMMock.mockResolvedValueOnce(baseWM);
    const { createUpdateWorkingMemoryTool } = await import('./update-working-memory');
    const tool = createUpdateWorkingMemoryTool({ threadId: 't-1' });

    const tooMany = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, title: `P${i}` }));
    await expect(
      tool.execute!({ patch: { pages: tooMany } }, { toolCallId: 'tc', messages: [] } as never)
    ).rejects.toThrow();
  });

  it('strips server-bound identity (clientId/personaId/icpId) from patch (ADR-0006)', async () => {
    getWMMock.mockResolvedValueOnce(baseWM);
    setWMMock.mockImplementation(async (_t, p) => p);

    const { createUpdateWorkingMemoryTool } = await import('./update-working-memory');
    const tool = createUpdateWorkingMemoryTool({ threadId: 't-1' });

    // Modelo tenta se passar por outro tenant — Zod do tool patch (omit)
    // remove os 3 campos identitários antes do merge.
    await tool.execute!(
      {
        patch: {
          briefing: 'novo',
          clientId: 'BRZ',
          personaId: 'attacker',
          icpId: 'icp-evil',
        } as never,
      },
      { toolCallId: 'tc', messages: [] } as never,
    );

    const [, payload] = setWMMock.mock.calls[0];
    expect(payload.clientId).toBe('OM'); // identity preservada do current
    expect(payload.personaId).toBe('originador');
    expect(payload.icpId).toBe('icp-1');
    expect(payload.briefing).toBe('novo'); // único campo aceito
  });
});
