import { describe, it, expect, vi } from 'vitest';
import { AiStudioRepo } from '../repo';

/** Fake Firestore mínimo p/ um doc de agente user-origin. Captura o update. */
function makeFakeDb(captured: { value?: Record<string, unknown> }) {
  const docApi = {
    get: async () => ({
      exists: true,
      id: 'agente-x',
      data: () => ({ origin: 'user', name: 'Agente X', model: 'fast' }),
    }),
    update: async (v: Record<string, unknown>) => {
      captured.value = v;
    },
  };
  return {
    collection: () => ({ doc: () => docApi }),
    batch: () => ({ update: vi.fn(), commit: vi.fn() }),
  } as unknown as FirebaseFirestore.Firestore;
}

describe('AiStudioRepo.patch — valida model contra o schema (a6-ia-01)', () => {
  it("rejeita PATCH com model:'slow' (tier inválido)", async () => {
    const captured: { value?: Record<string, unknown> } = {};
    const repo = new AiStudioRepo('agent', makeFakeDb(captured));
    await expect(repo.patch('agente-x', { model: 'slow' })).rejects.toThrow();
    expect(captured.value).toBeUndefined(); // nada persistido
  });

  it("aceita PATCH com model:'flash' e persiste", async () => {
    const captured: { value?: Record<string, unknown> } = {};
    const repo = new AiStudioRepo('agent', makeFakeDb(captured));
    await repo.patch('agente-x', { model: 'flash' });
    expect(captured.value?.model).toBe('flash');
  });
});
