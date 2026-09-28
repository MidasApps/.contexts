/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminMock, repoState, dryRunMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoState: {
    getById: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    markNeedsRevalidation: vi.fn(),
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
vi.mock('@/shared/config/glossary', () => ({
  GLOSSARY_VERSION: 'v-test',
}));

import { POST as APPROVE } from '../[id]/approve/route';
import { POST as REJECT } from '../[id]/reject/route';
import { POST as REVALIDATE } from '../[id]/revalidate/route';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function reqJson(body: unknown) {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin sql-catalog approve/reject/revalidate', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    dryRunMock.mockReset();
    repoState.getById.mockReset();
    repoState.approve.mockReset();
    repoState.reject.mockReset();
  });

  it('approve 401 when not authed', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await APPROVE(reqJson({ qualityScore: 0.9 }), makeParams('a'));
    expect(res.status).toBe(401);
  });

  it('approve 422 when qualityScore below threshold', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    const res = await APPROVE(reqJson({ qualityScore: 0.5 }), makeParams('a'));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error).toMatch(/quality_score/);
  });

  it('approve 422 when dry_run fails', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
    });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'bad' });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'OM' }), makeParams('a'));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error).toMatch(/dry_run/);
  });

  it('approve 422 when bytes_processed exceeds 5GB', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
    });
    dryRunMock.mockResolvedValueOnce({
      valid: true,
      bytesProcessed: 6 * 1024 * 1024 * 1024,
    });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'OM' }), makeParams('a'));
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error).toMatch(/bytes_processed/);
  });

  it('approve 403 when clientId mismatch (multi-tenant guard)', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
    });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'BRZ' }), makeParams('a'));
    expect(res.status).toBe(403);
  });

  it('approve 400 quando clientId ausente (enforce, não opt-in)', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    const res = await APPROVE(reqJson({ qualityScore: 0.9 }), makeParams('a'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/clientId/);
  });

  it('approve 400 quando clientId string vazia', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: '  ' }), makeParams('a'));
    expect(res.status).toBe(400);
  });

  it('approve 200 quando clientId bate com o row alvo', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    dryRunMock.mockResolvedValueOnce({ valid: true, bytesProcessed: 1024 });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'OM' }), makeParams('a'));
    expect(res.status).toBe(200);
    // O cliente vem do row, não do body.
    expect(dryRunMock).toHaveBeenCalledWith('SELECT 1', 'OM');
  });

  it('approve 200 happy path stamps versions and uses uid as curatedBy', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin-uid' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
    });
    dryRunMock.mockResolvedValueOnce({
      valid: true,
      bytesProcessed: 1024,
    });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'OM' }), makeParams('a'));
    expect(res.status).toBe(200);
    expect(repoState.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a',
        curatedBy: 'admin-uid',
        qualityScore: 0.9,
        glossaryVersion: 'v-test',
      }),
    );
  });

  it('reject 200 marks deprecated', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a' });
    const res = await REJECT(reqJson({}), makeParams('a'));
    expect(res.status).toBe(200);
    expect(repoState.reject).toHaveBeenCalledWith({ id: 'a' });
  });

  it('reject 401 when not authed', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await REJECT(reqJson({}), makeParams('a'));
    expect(res.status).toBe(401);
  });

  it('revalidate 200 re-stamps versions on dry_run success', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
      quality_score: 0.85,
      curated_by: 'orig-curator',
    });
    dryRunMock.mockResolvedValueOnce({ valid: true, bytesProcessed: 1024 });
    const res = await REVALIDATE(reqJson({}), makeParams('a'));
    expect(res.status).toBe(200);
    expect(repoState.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a',
        curatedBy: 'orig-curator',
        qualityScore: 0.85,
        glossaryVersion: 'v-test',
      }),
    );
  });

  it('revalidate 422 if dry_run fails', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({
      id: 'a',
      client_id: 'OM',
      sql: 'SELECT 1',
    });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'bad' });
    const res = await REVALIDATE(reqJson({}), makeParams('a'));
    expect(res.status).toBe(422);
  });

  /** Seguir aprovada mantinha o SQL reprovado sendo servido ao modelo. */
  it('revalidate that fails takes an approved row out of approved', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.markNeedsRevalidation.mockReset();
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1', status: 'approved' });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'fora do escopo' });

    const res = await REVALIDATE(reqJson({}), makeParams('a'));

    expect(res.status).toBe(422);
    expect(repoState.markNeedsRevalidation).toHaveBeenCalledWith({ affectedIds: ['a'] });
    expect((await res.json()).status).toBe('needs_revalidation');
  });

  it('revalidate over budget also takes an approved row out of approved', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.markNeedsRevalidation.mockReset();
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1', status: 'approved' });
    dryRunMock.mockResolvedValueOnce({ valid: true, bytesProcessed: 6 * 1024 ** 3 });

    const res = await REVALIDATE(reqJson({}), makeParams('a'));

    expect(res.status).toBe(422);
    expect(repoState.markNeedsRevalidation).toHaveBeenCalledWith({ affectedIds: ['a'] });
  });

  it('revalidate that fails leaves a row that was not approved as it was', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.markNeedsRevalidation.mockReset();
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1', status: 'needs_revalidation' });
    dryRunMock.mockResolvedValueOnce({ valid: false, error: 'bad' });

    await REVALIDATE(reqJson({}), makeParams('a'));

    expect(repoState.markNeedsRevalidation).not.toHaveBeenCalled();
  });
});
