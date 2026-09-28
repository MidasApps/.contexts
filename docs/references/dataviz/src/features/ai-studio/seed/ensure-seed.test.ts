import { describe, it, expect } from 'vitest';

type FakeDbResult = {
  sets: Array<{ id: string; data: Record<string, unknown> }>;
  collection: () => { doc: (id: string) => unknown };
};

function fakeDb(existing: Record<string, { origin?: string }>): FakeDbResult {
  const sets: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    sets,
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: !!existing[id], data: () => existing[id] }),
        set: async (data: Record<string, unknown>) => { sets.push({ id, data }); existing[id] = data as never; },
      }),
    }),
  };
}

import { ensureSeed } from './ensure-seed';

describe('ensureSeed', () => {
  it('sem force: cria ausentes, preserva existentes', async () => {
    const db = fakeDb({ descriptive: { origin: 'system' } });
    await ensureSeed(db as never);
    expect(db.sets.find((s) => s.id === 'descriptive')).toBeUndefined(); // existente preservado
    expect(db.sets.find((s) => s.id === 'orchestrator')).toBeDefined();  // ausente criado
  });

  it('force: sobrescreve origin:system, preserva origin:user', async () => {
    const db = fakeDb({ descriptive: { origin: 'system' }, 'minha-skill': { origin: 'user' } });
    await ensureSeed(db as never, { force: true });
    expect(db.sets.find((s) => s.id === 'descriptive')).toBeDefined(); // system sobrescrito
    // doc origin:user nunca está nos SYSTEM_SEEDS, então nunca é tocado — não há set para ele
    expect(db.sets.find((s) => s.id === 'minha-skill')).toBeUndefined();
  });
});
