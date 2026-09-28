/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getExternalTokenMock = vi.fn();
const getIdTokenMock = vi.fn();

vi.mock('@/shared/lib/external-token', () => ({
  getExternalToken: () => getExternalTokenMock(),
}));
vi.mock('@/shared/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: { getIdToken: getIdTokenMock } }),
}));

import { getClientAuthToken, authJsonHeaders } from '@/shared/lib/auth/client-token';

beforeEach(() => {
  getExternalTokenMock.mockReset().mockReturnValue(null);
  getIdTokenMock.mockReset().mockResolvedValue('firebase-token');
});

/**
 * Regressão: `/api/export-pdf` exige `verifyAuthToken` e o `usePdfExport`
 * chamava sem `Authorization` — 401 em qualquer ambiente onde o bypass de dev
 * não vale, ou seja, produção. O helper abaixo é o que ele passou a usar; se
 * alguém voltar a montar o header à mão, este contrato é o que quebra.
 */
describe('client-token (usado pelo export de PDF)', () => {
  it('monta Bearer + Content-Type para as rotas de API', async () => {
    await expect(authJsonHeaders()).resolves.toEqual({
      Authorization: 'Bearer firebase-token',
      'Content-Type': 'application/json',
    });
  });

  it('prefere o token externo — no iframe embutido não existe currentUser', async () => {
    getExternalTokenMock.mockReturnValue('token-do-shell');
    await expect(getClientAuthToken()).resolves.toBe('token-do-shell');
    expect(getIdTokenMock).not.toHaveBeenCalled();
  });

  it('falha alto quando não há sessão, em vez de mandar request sem auth', async () => {
    getIdTokenMock.mockResolvedValue(undefined);
    await expect(getClientAuthToken()).rejects.toThrow(/not authenticated/i);
  });
});
