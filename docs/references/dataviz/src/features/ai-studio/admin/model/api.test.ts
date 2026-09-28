import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/external-token', () => ({ getExternalToken: () => 'tok' }));

import { makeAiStudioApi, fetchTools } from './api';

const api = makeAiStudioApi('skills');

function mockFetch(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status, json: async () => json,
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('ai-studio client api', () => {
  it('list chama GET /api/ai-studio/skills e retorna data', async () => {
    const f = mockFetch({ data: [{ id: 's1' }] });
    vi.stubGlobal('fetch', f);
    const rows = await api.list();
    expect(rows).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('/api/ai-studio/skills');
  });

  it('save faz POST e propaga warnings', async () => {
    const f = mockFetch({ data: { id: 'safra', warnings: ['ref órfã'] } });
    vi.stubGlobal('fetch', f);
    const res = await api.save({ id: 'safra', name: 'Safra' });
    expect(res.id).toBe('safra');
    expect(res.warnings).toEqual(['ref órfã']);
    expect(f.mock.calls[0][1].method).toBe('POST');
  });

  it('reset faz POST com action=reset', async () => {
    const f = mockFetch({ data: { id: 'descriptive' } });
    vi.stubGlobal('fetch', f);
    await api.reset('descriptive');
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ action: 'reset', id: 'descriptive' });
  });

  it('remove faz DELETE com id na query', async () => {
    const f = mockFetch({ ok: true });
    vi.stubGlobal('fetch', f);
    await api.remove('u1');
    expect(f.mock.calls[0][0]).toContain('id=u1');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });

  it('lança erro quando !ok', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'boom' }, false, 422));
    await expect(api.remove('sys')).rejects.toThrow('boom');
  });

  it('fetchTools chama /api/ai-studio/tools', async () => {
    const f = mockFetch({ data: [{ key: 'execute_sql' }] });
    vi.stubGlobal('fetch', f);
    const tools = await fetchTools();
    expect(tools[0].key).toBe('execute_sql');
  });
});
