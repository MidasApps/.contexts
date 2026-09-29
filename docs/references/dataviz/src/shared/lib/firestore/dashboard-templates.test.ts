/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Token resolver — evita tocar firebase nos testes.
vi.mock('@/shared/lib/external-token', () => ({ getExternalToken: () => 'ext-token' }));

import { saveTemplate } from './dashboard-templates';

function mockFetchOk(data: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  })) as unknown as typeof fetch;
}

// saveTemplate é UI-free: apenas RETORNA warnings. O surfacing (toast) vive no
// hook useAdminTemplates, espelhando useAdminProducts/useAdminMetrics.
describe('saveTemplate — contrato de retorno de warnings soft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna { id, warnings } quando o 200 traz warnings', async () => {
    global.fetch = mockFetchOk({ id: 'novo', warnings: ['productRefs "credit" inexistente'] });
    const result = await saveTemplate({ id: 'novo' });

    expect(result.id).toBe('novo');
    expect(result.warnings).toEqual(['productRefs "credit" inexistente']);
  });

  it('omite warnings quando o 200 não traz nenhum', async () => {
    global.fetch = mockFetchOk({ id: 'novo' });
    const result = await saveTemplate({ id: 'novo' });

    expect(result.id).toBe('novo');
    expect(result.warnings).toBeUndefined();
  });
});
