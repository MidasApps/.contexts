/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoGetMock: vi.fn(),
  ingestMock: vi.fn(),
  listSourcesMock: vi.fn(),
  deleteSourceMock: vi.fn(),
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: h.requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));
vi.mock('@/features/ai-studio/repo', () => ({ AiStudioRepo: vi.fn(function () { return { get: h.repoGetMock }; }) }));
vi.mock('@/features/ai-studio/kb/ingest', () => ({ ingestKbFile: h.ingestMock }));
vi.mock('@/features/ai-studio/kb/sources-repo', () => ({ listSources: h.listSourcesMock, getSource: vi.fn(), deleteSource: h.deleteSourceMock }));

import { GET, POST, DELETE } from '../route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function uploadReq(file: { name: string; type: string; content: string }) {
  const fd = new FormData();
  fd.append('file', new File([file.content], file.name, { type: file.type }));
  return new Request('http://x/api/ai-studio/kb/kb1/docs', { method: 'POST', body: fd });
}

beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('kb docs route', () => {
  it('GET 401 sem admin', async () => {
    h.requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(new Request('http://x/api/ai-studio/kb/kb1/docs'), params('kb1'));
    expect(res.status).toBe(401);
  });

  it('GET lista sources da KB', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.listSourcesMock.mockResolvedValueOnce([{ id: 's1', filename: 'a.md', status: 'ready' }]);
    const res = await GET(new Request('http://x/api/ai-studio/kb/kb1/docs'), params('kb1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it('POST 404 quando KB não existe', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.repoGetMock.mockResolvedValueOnce(null);
    const res = await POST(uploadReq({ name: 'a.md', type: 'text/markdown', content: '# x' }), params('kb1'));
    expect(res.status).toBe(404);
  });

  it('POST 400 ext inválida', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.repoGetMock.mockResolvedValueOnce({ id: 'kb1', clientId: null });
    const res = await POST(uploadReq({ name: 'a.docx', type: 'x', content: 'x' }), params('kb1'));
    expect(res.status).toBe(400);
    expect(h.ingestMock).not.toHaveBeenCalled();
  });

  it('POST 200 happy path chama ingestKbFile e retorna o source', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'admin@x' });
    h.repoGetMock.mockResolvedValueOnce({ id: 'kb1', clientId: 'OM' });
    h.ingestMock.mockResolvedValueOnce({ id: 's1', filename: 'a.md', status: 'ready', chunkCount: 3 });
    const res = await POST(uploadReq({ name: 'a.md', type: 'text/markdown', content: '# Doc' }), params('kb1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('ready');
    expect(h.ingestMock).toHaveBeenCalledWith(expect.objectContaining({ kb: { id: 'kb1', clientId: 'OM' }, filename: 'a.md' }), undefined);
  });

  it('DELETE remove source', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.deleteSourceMock.mockResolvedValueOnce(undefined);
    const res = await DELETE(new Request('http://x/api/ai-studio/kb/kb1/docs?docId=s1', { method: 'DELETE' }), params('kb1'));
    expect(res.status).toBe(200);
    expect(h.deleteSourceMock).toHaveBeenCalledWith('s1', undefined);
  });

  it('DELETE 400 sem docId', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await DELETE(new Request('http://x/api/ai-studio/kb/kb1/docs', { method: 'DELETE' }), params('kb1'));
    expect(res.status).toBe(400);
  });
});
