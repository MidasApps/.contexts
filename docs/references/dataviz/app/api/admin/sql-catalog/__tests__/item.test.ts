/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminMock, repoState, dryRunMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoState: {
    getById: vi.fn(),
    updateFields: vi.fn(),
    reject: vi.fn(),
  },
  dryRunMock: vi.fn(),
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));
vi.mock('@/features/sql-catalog/repository', () => ({
  createRepository: () => repoState,
}));
vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({}),
}));
vi.mock('@/features/ai-agents/tools/bq-dry-run', () => ({
  dryRunInClientScope: dryRunMock,
}));

import { GET, PATCH, DELETE } from '../[id]/route';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('admin sql-catalog [id] route', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    dryRunMock.mockReset();
    repoState.getById.mockReset();
    repoState.updateFields.mockReset();
    repoState.reject.mockReset();
  });

  it('GET 401 if requireAdmin returns 401', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(new Request('http://x'), makeParams('a'));
    expect(res.status).toBe(401);
  });

  it('GET 404 when not found', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.getById.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x'), makeParams('a'));
    expect(res.status).toBe(404);
  });

  it('GET 200 returns item', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM' });
    const res = await GET(new Request('http://x'), makeParams('a'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.id).toBe('a');
  });

  it('PATCH 422 when SQL changes and dry_run fails', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', sql: 'SELECT 1' });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'bad' });
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT broken' }),
      }),
      makeParams('a'),
    );
    expect(res.status).toBe(422);
  });

  it('PATCH 200 happy path with intent change', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', sql: 'SELECT 1', intent: 'old' });
    repoState.updateFields.mockResolvedValueOnce(undefined);
    repoState.getById.mockResolvedValueOnce({ id: 'a', sql: 'SELECT 1', intent: 'new' });
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'new' }),
      }),
      makeParams('a'),
    );
    expect(res.status).toBe(200);
    expect(repoState.updateFields).toHaveBeenCalledWith({ id: 'a', intent: 'new' });
  });

  it('DELETE soft-deletes via reject', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.getById.mockResolvedValueOnce({ id: 'a' });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), makeParams('a'));
    expect(res.status).toBe(200);
    expect(repoState.reject).toHaveBeenCalledWith({ id: 'a' });
  });
});
