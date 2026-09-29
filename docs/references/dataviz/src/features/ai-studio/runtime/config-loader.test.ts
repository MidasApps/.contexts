import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getMock, listMock } = vi.hoisted(() => ({ getMock: vi.fn(), listMock: vi.fn() }));
vi.mock('../repo', () => ({
  AiStudioRepo: vi.fn(function () { return { get: getMock, list: listMock }; }),
}));

import { loadSkills, loadSkillPlaybooks, loadWorkflows } from './config-loader';

beforeEach(() => { getMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('loadSkills', () => {
  it('refs vazio → [] sem buscar', async () => {
    const out = await loadSkills([]);
    expect(out).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('devolve docs existentes, pula inexistentes, preserva ordem', async () => {
    getMock.mockImplementation(async (id: string) =>
      id === 'safra-test-1' ? { id: 'safra-test-1', name: 'Safra', playbook: 'passo', toolRefs: ['execute_sql'], knowledgeBaseRefs: ['k1'] }
      : id === 'ltv-test-1' ? { id: 'ltv-test-1', name: 'LTV', playbook: '', toolRefs: [], knowledgeBaseRefs: ['k2'] }
      : null);
    const out = await loadSkills(['safra-test-1', 'nao-existe', 'ltv-test-1']);
    expect(out.map((s) => s.id)).toEqual(['safra-test-1', 'ltv-test-1']);
  });

  it('segunda chamada dentro do TTL não re-busca (cache hit)', async () => {
    const key = 'skill-cache-hit';
    getMock.mockResolvedValue({ id: key, name: 'Cache', playbook: 'pb' });

    await loadSkills([key]);
    expect(getMock).toHaveBeenCalledTimes(1);
    getMock.mockClear();

    await loadSkills([key]);
    expect(getMock).toHaveBeenCalledTimes(0);
  });

  it('cache expira após TTL e re-busca do Firestore', async () => {
    vi.useFakeTimers();
    const key = 'skill-ttl-expiry';
    getMock.mockResolvedValue({ id: key, name: 'V1', playbook: 'pb' });

    await loadSkills([key]);
    expect(getMock).toHaveBeenCalledTimes(1);
    getMock.mockClear();

    vi.advanceTimersByTime(30_001); // passa do TTL (30s)
    getMock.mockResolvedValue({ id: key, name: 'V2', playbook: 'pb2' });
    const after = await loadSkills([key]);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(after[0].name).toBe('V2');
  });
});

describe('loadSkillPlaybooks (saída inalterada)', () => {
  it('formata só skills com playbook não-vazio', async () => {
    getMock.mockImplementation(async (id: string) =>
      id === 'safra-test-2' ? { id: 'safra-test-2', name: 'Safra', playbook: 'passo a passo' }
      : id === 'vazia-test-2' ? { id: 'vazia-test-2', name: 'Vazia', playbook: '   ' }
      : null);
    const out = await loadSkillPlaybooks(['safra-test-2', 'vazia-test-2']);
    expect(out).toEqual(['## Skill: Safra\npasso a passo']);
  });
});

describe('loadWorkflows', () => {
  it('lista só workflows active e cacheia (2ª chamada não re-busca)', async () => {
    listMock.mockReset();
    listMock.mockResolvedValue([
      { id: 'default', status: 'active', isDefault: true, instruction: 'i', description: 'd' },
      { id: 'old', status: 'archived', isDefault: false, instruction: '', description: '' },
    ]);
    const a = await loadWorkflows();
    expect(a.map((w) => w.id)).toEqual(['default']);   // só active
    const before = listMock.mock.calls.length;
    await loadWorkflows();
    expect(listMock.mock.calls.length).toBe(before);    // cache hit, sem nova busca
  });
});
