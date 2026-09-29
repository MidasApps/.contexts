/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminMock, repoState, dryRunMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoState: {
    listByClient: vi.fn(),
    countByClient: vi.fn(),
    insertDraft: vi.fn(),
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

import { GET, POST } from '../route';

function reqGet(url: string) {
  return new Request(url);
}
function reqPost(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin sql-catalog collection route', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    dryRunMock.mockReset();
    repoState.listByClient.mockReset();
    repoState.countByClient.mockReset();
    repoState.insertDraft.mockReset();
  });

  it('GET returns 401 when requireAdmin fails with 401', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(reqGet('http://x/api/admin/sql-catalog?clientId=OM'));
    expect(res.status).toBe(401);
  });

  it('GET returns 403 when requireAdmin returns 403', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await GET(reqGet('http://x/api/admin/sql-catalog?clientId=OM'));
    expect(res.status).toBe(403);
  });

  it('GET returns 400 when clientId missing (multi-tenant fail-closed)', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    const res = await GET(reqGet('http://x/api/admin/sql-catalog'));
    expect(res.status).toBe(400);
  });

  it('GET returns paginated items + total', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.listByClient.mockResolvedValueOnce([{ id: '1', client_id: 'OM' }]);
    repoState.countByClient.mockResolvedValueOnce(42);
    const res = await GET(
      reqGet('http://x/api/admin/sql-catalog?clientId=OM&status=approved&page=2&pageSize=20'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.total).toBe(42);
    expect(json.page).toBe(2);
    expect(json.pageSize).toBe(20);
    expect(repoState.listByClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'OM', status: 'approved', limit: 20, offset: 20 }),
    );
  });

  it('GET adversarial: never returns rows from a different clientId (filter passed to repo)', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.listByClient.mockResolvedValueOnce([]);
    repoState.countByClient.mockResolvedValueOnce(0);
    await GET(reqGet('http://x/api/admin/sql-catalog?clientId=OM'));
    const arg = repoState.listByClient.mock.calls[0][0];
    expect(arg.clientId).toBe('OM');
  });

  it('POST 422 when dry_run fails', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'syntax' });
    const res = await POST(
      reqPost('http://x/api/admin/sql-catalog', {
        intent: 'a',
        sql: 'SELECT bad',
        clientId: 'OM',
      }),
    );
    expect(res.status).toBe(422);
  });

  it('POST 400 when missing fields', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    const res = await POST(reqPost('http://x/api/admin/sql-catalog', { intent: 'x' }));
    expect(res.status).toBe(400);
  });

  it('POST 201 on happy path', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    dryRunMock.mockResolvedValueOnce({ valid: true, bytesProcessed: 1000 });
    repoState.insertDraft.mockResolvedValueOnce({ id: 'new-id', sqlHash: 'h' });
    const res = await POST(
      reqPost('http://x/api/admin/sql-catalog', {
        intent: 'safra OM',
        sql: 'SELECT 1',
        clientId: 'OM',
        tags: ['kpi'],
      }),
    );
    expect(res.status).toBe(201);
    // Validado no escopo do cliente da entrada, não sem escopo.
    expect(dryRunMock).toHaveBeenCalledWith('SELECT 1', 'OM');
    const json = await res.json();
    expect(json.id).toBe('new-id');
    expect(json.status).toBe('draft');
  });
});
