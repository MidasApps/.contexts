import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  isAdmin: vi.fn(() => false),
  verifyClientAccess: vi.fn(
    async (): Promise<{ allowed: boolean; status?: number; error?: string }> => ({ allowed: true }),
  ),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: h.isAdmin }));
vi.mock('@/shared/lib/api-auth', () => ({ verifyClientAccess: h.verifyClientAccess }));

import { authorizeMetricWrite } from './authorize-metric';

beforeEach(() => {
  h.isAdmin.mockReset().mockReturnValue(false);
  h.verifyClientAccess.mockReset().mockResolvedValue({ allowed: true });
});

describe('authorizeMetricWrite', () => {
  it('admin pode tudo (inclusive global e promote)', async () => {
    h.isAdmin.mockReturnValue(true);
    expect((await authorizeMetricWrite('a@askliquid.com', null, 'create')).allowed).toBe(true);
    expect((await authorizeMetricWrite('a@askliquid.com', 'brz', 'promote')).allowed).toBe(true);
  });
  it('não-admin é barrado em métrica global', async () => {
    const r = await authorizeMetricWrite('u@x.com', null, 'create');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });
  it('não-admin é barrado em promote', async () => {
    expect((await authorizeMetricWrite('u@x.com', 'brz', 'promote')).allowed).toBe(false);
  });
  it('cliente dono pode CRUD da sua (delega a verifyClientAccess)', async () => {
    h.verifyClientAccess.mockResolvedValue({ allowed: true });
    expect((await authorizeMetricWrite('u@x.com', 'brz', 'update')).allowed).toBe(true);
    expect(h.verifyClientAccess).toHaveBeenCalledWith('u@x.com', 'brz');
  });
  it('não-dono é barrado (verifyClientAccess nega)', async () => {
    h.verifyClientAccess.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão para este cliente' });
    expect((await authorizeMetricWrite('u@x.com', 'conx', 'delete')).allowed).toBe(false);
  });
});
