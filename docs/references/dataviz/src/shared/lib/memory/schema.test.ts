import { describe, it, expect } from 'vitest';
import { WorkingMemorySchema, type WorkingMemory } from './schema';

const valid: WorkingMemory = {
  clientId: 'OM',
  personaId: 'originador',
  icpId: 'icp-1',
  productType: 'MCMV',
  briefing: 'Análise de inadimplência por safra',
  activeDashboardId: 'dash-123',
  pages: [],
  blocks: [],
  decisions: [],
  pendingQuestions: [],
};

describe('WorkingMemorySchema', () => {
  it('accepts a minimal valid payload', () => {
    expect(() => WorkingMemorySchema.parse(valid)).not.toThrow();
  });

  it('rejects more than 10 pages', () => {
    const tooMany = {
      ...valid,
      pages: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, title: `P${i}` })),
    };
    expect(() => WorkingMemorySchema.parse(tooMany)).toThrow();
  });

  it('rejects more than 50 decisions', () => {
    const tooMany = {
      ...valid,
      decisions: Array.from({ length: 51 }, (_, i) => ({
        ts: new Date().toISOString(),
        kind: 'layout',
        rationale: `r${i}`,
      })),
    };
    expect(() => WorkingMemorySchema.parse(tooMany)).toThrow();
  });

  it('rejects missing clientId', () => {
    const { clientId: _clientId, ...rest } = valid;
    expect(() => WorkingMemorySchema.parse(rest)).toThrow();
  });

  it('rejects non-string personaId', () => {
    expect(() =>
      WorkingMemorySchema.parse({ ...valid, personaId: 42 as unknown as string })
    ).toThrow();
  });
});
