/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminMock, repoState, getSeedMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoState: {
    list: vi.fn(), get: vi.fn(), upsert: vi.fn(), patch: vi.fn(), remove: vi.fn(), reset: vi.fn(),
  },
  getSeedMock: vi.fn(),
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));
vi.mock('@/features/ai-studio/repo', () => ({
  AiStudioRepo: vi.fn(function () { return repoState; }),
}));
vi.mock('@/features/ai-studio/seed/manifest', () => ({ getSeed: getSeedMock }));

import { makeAiStudioRoutes } from '../route-factory';
import { ProtectionError } from '@/features/ai-studio/protection';

const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('skill');

function req(url: string, method = 'GET', body?: unknown) {
  return new Request(url, method === 'GET' || method === 'DELETE'
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  Object.values(repoState).forEach((m) => (m as Mock).mockReset());
  requireAdminMock.mockReset();
  getSeedMock.mockReset();
});

describe('makeAiStudioRoutes', () => {
  it('GET 401 quando requireAdmin falha', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await GET(req('http://x/api/ai-studio/skills'))).status).toBe(401);
  });

  it('GET lista', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.list.mockResolvedValueOnce([{ id: 's1' }]);
    const res = await GET(req('http://x/api/ai-studio/skills'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it('GET por id 404', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.get.mockResolvedValueOnce(null);
    expect((await GET(req('http://x/api/ai-studio/skills?id=nope'))).status).toBe(404);
  });

  it('POST upsert retorna id + warnings', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.upsert.mockResolvedValueOnce({ id: 'safra', warnings: ['x'] });
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { id: 'safra', name: 'Safra' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 'safra', warnings: ['x'] });
  });

  it('POST id inválido 400', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { id: 'Bad Id', name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('POST action=reset chama repo.reset com o seed', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    getSeedMock.mockReturnValueOnce({ doc: { name: 'Seed' } });
    repoState.reset.mockResolvedValueOnce(undefined);
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { action: 'reset', id: 'descriptive' }));
    expect(res.status).toBe(200);
    expect(repoState.reset).toHaveBeenCalledWith('descriptive', { name: 'Seed' });
  });

  it('POST action=reset 404 quando não há seed', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    getSeedMock.mockReturnValueOnce(undefined);
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { action: 'reset', id: 'foo' }));
    expect(res.status).toBe(404);
  });

  it('DELETE bloqueado em system vira 422', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.remove.mockRejectedValueOnce(new ProtectionError('nope'));
    expect((await DELETE(req('http://x/api/ai-studio/skills?id=sys', 'DELETE'))).status).toBe(422);
  });

  it('PATCH campo travado vira 422', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.patch.mockRejectedValueOnce(new ProtectionError('nope'));
    const res = await PATCH(req('http://x/api/ai-studio/skills', 'PATCH', { id: 'sys', kind: 'x' }));
    expect(res.status).toBe(422);
  });
});
