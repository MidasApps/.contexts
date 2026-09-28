import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ __ts: 'agora' }) },
}));

import { auditFields, SCHEMA_VERSION } from '../audit';

const NOW = { __ts: 'fixo' } as never;

describe('auditFields', () => {
  it('documento novo grava autor e data de criação', () => {
    const f = auditFields('alice@x.com', true, NOW);
    expect(f.createdBy).toBe('alice@x.com');
    expect(f.updatedBy).toBe('alice@x.com');
    expect(f.createdAt).toBe(NOW);
    expect(f.updatedAt).toBe(NOW);
  });

  // Sob `set(..., { merge: true })`, reescrever createdBy a cada update apagaria
  // o autor original — justamente o dado que a trilha existe para guardar e que
  // não se recupera depois.
  it('documento existente NÃO carrega createdBy nem createdAt', () => {
    const f = auditFields('bob@x.com', false, NOW);
    expect(f).not.toHaveProperty('createdBy');
    expect(f).not.toHaveProperty('createdAt');
    expect(f.updatedBy).toBe('bob@x.com');
  });

  it('toda escrita declara a versão do formato', () => {
    expect(auditFields('a@x.com', true, NOW).schemaVersion).toBe(SCHEMA_VERSION);
    expect(auditFields('a@x.com', false, NOW).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('espalhar sobre o payload não perde campo', () => {
    const doc = { name: 'X', ...auditFields('a@x.com', true, NOW) };
    expect(Object.keys(doc).sort()).toEqual(
      ['createdAt', 'createdBy', 'name', 'schemaVersion', 'updatedAt', 'updatedBy'],
    );
  });
});
