import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: vi.fn() }));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: vi.fn() }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }) }));

import { verifyAuthToken } from '@/shared/lib/api-auth';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { POST, DELETE } from '../route';

beforeEach(() => vi.clearAllMocks());

function req(body: unknown, url = 'http://x/api/dashboard-templates') {
  return new Request(url, { method: 'POST', body: JSON.stringify(body) });
}

describe('dashboard-templates escrita exige admin', () => {
  it('POST de não-admin retorna 403', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue('user@cliente.com');
    vi.mocked(isAdminEmail).mockReturnValue(false);
    const res = await POST(req({ id: 'x', name: 'X' }));
    expect(res.status).toBe(403);
  });
  it('DELETE de não-admin retorna 403', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue('user@cliente.com');
    vi.mocked(isAdminEmail).mockReturnValue(false);
    const res = await DELETE(new Request('http://x/api/dashboard-templates?id=x', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });
});
