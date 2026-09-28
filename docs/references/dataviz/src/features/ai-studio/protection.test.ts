import { describe, it, expect } from 'vitest';
import {
  LOCKED_FIELDS, isLockedField, assertDeletable, assertPatchAllowed,
  stripLockedOnUpsert, ProtectionError,
} from './protection';

describe('protection', () => {
  it('agente trava id/systemKey/kind', () => {
    expect(LOCKED_FIELDS.agent).toEqual(expect.arrayContaining(['id', 'systemKey', 'kind']));
    expect(isLockedField('agent', 'instructions')).toBe(false);
    expect(isLockedField('agent', 'kind')).toBe(true);
  });

  it('KB trava clientId', () => {
    expect(isLockedField('knowledgeBase', 'clientId')).toBe(true);
  });

  it('assertDeletable bloqueia system', () => {
    expect(() => assertDeletable('system')).toThrow(ProtectionError);
    expect(() => assertDeletable('user')).not.toThrow();
  });

  it('assertPatchAllowed bloqueia campo travado em system', () => {
    expect(() => assertPatchAllowed('agent', 'system', { kind: 'orchestrator' })).toThrow(ProtectionError);
    expect(() => assertPatchAllowed('agent', 'system', { instructions: 'x' })).not.toThrow();
    expect(() => assertPatchAllowed('agent', 'user', { kind: 'orchestrator' })).not.toThrow();
  });

  it('stripLockedOnUpsert preserva campos travados do doc system existente', () => {
    const existing = { kind: 'orchestrator', instructions: 'old', systemKey: 'sup' };
    const incoming = { kind: 'worker', instructions: 'new' };
    const out = stripLockedOnUpsert('agent', 'system', incoming, existing);
    expect(out.kind).toBe('orchestrator');   // travado: mantém o existente
    expect(out.instructions).toBe('new');     // editável: aplica o novo
  });

  it('stripLockedOnUpsert em user passa tudo', () => {
    const out = stripLockedOnUpsert('agent', 'user', { kind: 'worker' }, {});
    expect(out.kind).toBe('worker');
  });
});
