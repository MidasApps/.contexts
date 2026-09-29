/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));

import * as toolsRoute from '../tools/route';
import * as agentsRoute from '../agents/route';

describe('rotas ai-studio (smoke)', () => {
  beforeEach(() => requireAdminMock.mockReset());

  it('agents exporta os 4 verbos', () => {
    for (const v of ['GET', 'POST', 'PATCH', 'DELETE']) {
      expect(typeof (agentsRoute as Record<string, unknown>)[v]).toBe('function');
    }
  });

  it('tools GET retorna o manifest', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await toolsRoute.GET(new Request('http://x/api/ai-studio/tools'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.some((t: { key: string }) => t.key === 'execute_sql')).toBe(true);
  });

  it('tools GET 401 sem admin', async () => {
    const { NextResponse } = await import('next/server');
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await toolsRoute.GET(new Request('http://x/api/ai-studio/tools'))).status).toBe(401);
  });
});
