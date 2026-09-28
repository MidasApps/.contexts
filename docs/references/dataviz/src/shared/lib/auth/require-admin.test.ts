import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyIdTokenMock = vi.fn();

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: verifyIdTokenMock }),
}));

vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: () => {},
  ensureFirebaseAdmin: () => {},
  getDb: () => ({}),
  getAdminFirestore: () => ({}),
}));

vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: (email?: string | null) =>
    !!email && email.toLowerCase().endsWith('@askliquid.com'),
  isDevAuthBypassEnabled: () => false,
  DEV_BYPASS_EMAIL: 'dev@askliquid.com',
  ADMIN_EMAIL_DOMAIN: 'askliquid.com',
}));

import { requireAdmin, isAdminAuthOk } from './require-admin';

function makeReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/x', { headers });
}

describe('requireAdmin', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await requireAdmin(makeReq({}));
    expect(isAdminAuthOk(res)).toBe(false);
    if (!isAdminAuthOk(res)) {
      expect(res.status).toBe(401);
    }
  });

  it('returns 401 when token is invalid', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('bad token'));
    const res = await requireAdmin(makeReq({ authorization: 'Bearer foo' }));
    expect(isAdminAuthOk(res)).toBe(false);
    if (!isAdminAuthOk(res)) {
      expect(res.status).toBe(401);
    }
  });

  it('returns 403 when token is valid but lacks admin claim or admin email', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({
      uid: 'u1',
      email: 'user@external.com',
      role: 'viewer',
    });
    const res = await requireAdmin(makeReq({ authorization: 'Bearer foo' }));
    expect(isAdminAuthOk(res)).toBe(false);
    if (!isAdminAuthOk(res)) {
      expect(res.status).toBe(403);
    }
  });

  it('returns {uid} when role=admin custom claim present', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({
      uid: 'admin-uid',
      email: 'someone@external.com',
      role: 'admin',
    });
    const res = await requireAdmin(makeReq({ authorization: 'Bearer foo' }));
    expect(isAdminAuthOk(res)).toBe(true);
    if (isAdminAuthOk(res)) {
      expect(res.uid).toBe('admin-uid');
    }
  });

  it('returns {uid} when admin-domain email used as fallback', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({
      uid: 'admin-uid',
      email: 'curator@askliquid.com',
    });
    const res = await requireAdmin(makeReq({ authorization: 'Bearer foo' }));
    expect(isAdminAuthOk(res)).toBe(true);
    if (isAdminAuthOk(res)) {
      expect(res.uid).toBe('admin-uid');
    }
  });
});
