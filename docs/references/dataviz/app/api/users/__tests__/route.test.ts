/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, isAdminEmailMock, verifyCanProvisionMock, getProvisionScopeMock, dbState, authState } = vi.hoisted(() => {
  const userDocRef = {
    get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
    set: vi.fn(async (_doc: Record<string, unknown>) => undefined),
    delete: vi.fn(async () => undefined),
  };
  /*
   * Tipo explícito no snapshot: sem ele o `vi.fn(async () => ({ docs: [] }))`
   * infere `docs: never[]`, e todo `mockResolvedValue` posterior com documentos
   * de verdade — ou com `empty` — vira erro de tipo.
   */
  type UsersSnapshot = {
    empty?: boolean;
    docs: Array<{ id: string; data: () => Record<string, unknown> }>;
  };
  const usersCol = {
    doc: vi.fn(() => userDocRef),
    get: vi.fn(async (): Promise<UsersSnapshot> => ({ docs: [] })),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // where(...).limit(...).get() → default: no duplicate email
  usersCol.get.mockResolvedValue({ empty: true, docs: [] });
  const clientsCol = { get: vi.fn(async () => ({ docs: [{ id: 'vila-rosa' }, { id: 'om' }] })) };
  const groupsCol = { get: vi.fn(async () => ({ docs: [{ id: 'analyst' }] })) };
  return {
    verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'admin@askliquid.com'),
    isAdminEmailMock: vi.fn(() => true),
    verifyCanProvisionMock: vi.fn(async (): Promise<{
      allowed: boolean; global: boolean; adminClientIds: string[]; error?: string; status?: number;
    }> => ({ allowed: true, global: true, adminClientIds: [] })),
    getProvisionScopeMock: vi.fn(async (): Promise<{
      allowed: boolean; global: boolean; adminClientIds: string[]; error?: string; status?: number;
    }> => ({ allowed: true, global: true, adminClientIds: [] })),
    dbState: {
      collection: vi.fn((name: string) =>
        name === 'clients' ? clientsCol : name === 'groups' ? groupsCol : usersCol,
      ),
      userDocRef,
      usersCol,
    },
    authState: {
      getUserByEmail: vi.fn(),
      createUser: vi.fn(),
      setCustomUserClaims: vi.fn(async () => undefined),
      generatePasswordResetLink: vi.fn(async () => 'https://reset.example/abc'),
    },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: verifyAuthTokenMock,
  verifyCanProvision: verifyCanProvisionMock,
  getProvisionScope: getProvisionScopeMock,
}));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => dbState,
  getAdminAuth: () => authState,
}));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { NextRequest } from 'next/server';
import { POST, GET, DELETE } from '../route';

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/users', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function getReq(): NextRequest {
  return new Request('http://localhost/api/users', {
    method: 'GET',
    headers: { authorization: 'Bearer test' },
  }) as unknown as NextRequest;
}

function delReq(id: string): NextRequest {
  return new Request(`http://localhost/api/users?id=${id}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer test' },
  }) as unknown as NextRequest;
}

const base = {
  id: 'novo_empresa_com',
  email: 'novo@empresa.com',
  displayName: 'Novo Usuário',
  groups: [] as string[],
  clientAccess: [{ clientId: 'vila-rosa' }],
};

describe('POST /api/users — provisionamento (Abordagem A)', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
    isAdminEmailMock.mockReturnValue(true);
    verifyCanProvisionMock.mockResolvedValue({ allowed: true, global: true, adminClientIds: [] });
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: true, adminClientIds: [] });
    dbState.usersCol.get.mockResolvedValue({ empty: true, docs: [] });
    dbState.userDocRef.get.mockResolvedValue({ exists: false, data: () => ({}) });
    authState.getUserByEmail.mockReset();
    authState.createUser.mockReset();
    authState.setCustomUserClaims.mockClear();
    authState.generatePasswordResetLink.mockClear();
  });

  it('cria conta Auth quando não existe, emite claim clientIds e devolve resetLink', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    authState.createUser.mockResolvedValueOnce({ uid: 'uid-123' });

    const res = await POST(req(base));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, uid: 'uid-123', credentialCreated: true, resetLink: 'https://reset.example/abc' });
    expect(authState.createUser).toHaveBeenCalledWith({ email: 'novo@empresa.com', displayName: 'Novo Usuário' });
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { clientIds: ['vila-rosa'] });
    expect(dbState.userDocRef.set).toHaveBeenCalled();
  });

  it('é idempotente: conta já existe → reusa uid, não cria, sem resetLink', async () => {
    authState.getUserByEmail.mockResolvedValueOnce({ uid: 'uid-existente', customClaims: { role: 'x' } });

    const res = await POST(req(base));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, uid: 'uid-existente', credentialCreated: false });
    expect(body.resetLink).toBeUndefined();
    expect(authState.createUser).not.toHaveBeenCalled();
    // preserva claims existentes ao mesclar
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-existente', { role: 'x', clientIds: ['vila-rosa'] });
  });

  it('erro auth/* inesperado no getUserByEmail → 502, não grava doc', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/internal-error' });
    const res = await POST(req(base));
    expect(res.status).toBe(502);
    expect(dbState.userDocRef.set).not.toHaveBeenCalled();
  });

  it('erro auth/* inesperado no createUser → 502, não grava doc', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    authState.createUser.mockRejectedValueOnce({ code: 'auth/email-already-exists' });
    const res = await POST(req(base));
    expect(res.status).toBe(502);
    expect(dbState.userDocRef.set).not.toHaveBeenCalled();
  });

  it('falha ao setar claim → 500, não grava doc (doc nunca à frente do claim)', async () => {
    authState.getUserByEmail.mockResolvedValueOnce({ uid: 'uid-9' });
    authState.setCustomUserClaims.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(req(base));
    expect(res.status).toBe(500);
    expect(dbState.userDocRef.set).not.toHaveBeenCalled();
  });

  it('provisionCredential:false sem conta Auth existente → só grava doc, sem criar nem emitir claim', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const res = await POST(req({ ...base, provisionCredential: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(authState.getUserByEmail).toHaveBeenCalledWith('novo@empresa.com');
    expect(authState.createUser).not.toHaveBeenCalled();
    expect(authState.setCustomUserClaims).not.toHaveBeenCalled();
    expect(dbState.userDocRef.set).toHaveBeenCalled();
  });

  it('I2 (Important, review final): provisionCredential:false com conta Auth existente → re-emite o claim projetado de clientAccess', async () => {
    authState.getUserByEmail.mockResolvedValueOnce({ uid: 'uid-existente', customClaims: { role: 'x' } });
    const res = await POST(req({
      ...base,
      clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
      provisionCredential: false,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(authState.createUser).not.toHaveBeenCalled();
    expect(authState.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-existente', { role: 'x', clientIds: ['vila-rosa', 'om'] });
    expect(dbState.userDocRef.set).toHaveBeenCalled();
  });

  it('I1 (Important, review final): admin global rebaixa clientAdmin — adminClientIds:[] grava array vazio (não fica stale)', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const res = await POST(req({ ...base, adminClientIds: [], provisionCredential: false }));
    expect(res.status).toBe(200);
    const written = dbState.userDocRef.set.mock.calls.at(-1)![0];
    expect(written.adminClientIds).toEqual([]);
  });

  it('401 sem auth', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce(null);
    const res = await POST(req(base));
    expect(res.status).toBe(401);
  });

  it('403 para não-admin', async () => {
    verifyCanProvisionMock.mockResolvedValueOnce({ allowed: false, global: false, adminClientIds: [], error: 'Sem permissão', status: 403 });
    const res = await POST(req(base));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users — clientAdmin merge por tenant', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('c@empresa.com');
    verifyCanProvisionMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
    dbState.usersCol.get.mockResolvedValue({ empty: true, docs: [] });
    authState.getUserByEmail.mockResolvedValue({ uid: 'uid-multi' });
    authState.setCustomUserClaims.mockClear();
    dbState.userDocRef.set.mockClear();
  });

  it('preserva a entrada de tenant fora do escopo (om) ao editar', async () => {
    // doc existente tem vila-rosa + om (email presente: o body reusa o mesmo,
    // então o guard de email imutável — FIX #1 review final 2 — não dispara)
    dbState.userDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'multi@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om', routeOverrides: ['/dashboard'] }] }),
    });
    // body malicioso: tenta remover om e manter só vila-rosa
    const res = await POST(req({
      id: 'multi_empresa_com', email: 'multi@empresa.com', displayName: 'Multi',
      groups: [], clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(200);
    const written = dbState.userDocRef.set.mock.calls.at(-1)![0];
    const writtenTenants = (written.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(writtenTenants).toEqual(['om', 'vila-rosa']); // om preservado
    // claim reflete a união final
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-multi', { clientIds: ['om', 'vila-rosa'] });
  });
});

describe('GET /api/users — escopo de clientAdmin (V6, review fix)', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('c@empresa.com');
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
  });

  it('clientAdmin de vila-rosa NÃO vê alvo com clientAccess vazio (ex.: admin global) nem alvo com adminClientIds fora do escopo', async () => {
    dbState.usersCol.get.mockResolvedValueOnce({
      docs: [
        { id: 'no-access', data: () => ({ email: 'ninguem@empresa.com', clientAccess: [] }) },
        { id: 'admin-om', data: () => ({ email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] }) },
        { id: 'in-scope', data: () => ({ email: 'user@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] }) },
      ],
    });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.data as { id: string }[]).map((u) => u.id);
    expect(ids).toEqual(['in-scope']);
  });

  it('admin global: lista todos os usuários independente do footprint (regressão)', async () => {
    getProvisionScopeMock.mockResolvedValueOnce({ allowed: true, global: true, adminClientIds: [] });
    dbState.usersCol.get.mockResolvedValueOnce({
      docs: [
        { id: 'no-access', data: () => ({ email: 'ninguem@empresa.com', clientAccess: [] }) },
        { id: 'admin-om', data: () => ({ email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] }) },
      ],
    });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.data as { id: string }[]).map((u) => u.id).sort();
    expect(ids).toEqual(['admin-om', 'no-access']);
  });
});

describe('DELETE /api/users — escopo de clientAdmin (V6, review fix)', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('c@empresa.com');
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
    dbState.userDocRef.delete.mockClear();
  });

  it('clientAdmin de vila-rosa NÃO exclui alvo com clientAccess vazio (footprint vazio não é vacuamente no escopo) → 403', async () => {
    dbState.userDocRef.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'admin-global@empresa.com', clientAccess: [] }),
    });
    const res = await DELETE(delReq('alvo_vazio'));
    expect(res.status).toBe(403);
    expect(dbState.userDocRef.delete).not.toHaveBeenCalled();
  });

  it('clientAdmin de vila-rosa NÃO exclui alvo com adminClientIds fora do escopo (admin de om) → 403', async () => {
    dbState.userDocRef.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] }),
    });
    const res = await DELETE(delReq('admin_om'));
    expect(res.status).toBe(403);
    expect(dbState.userDocRef.delete).not.toHaveBeenCalled();
  });

  it('clientAdmin de vila-rosa exclui alvo totalmente no escopo → 200', async () => {
    dbState.userDocRef.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'user@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] }),
    });
    const res = await DELETE(delReq('user_ok'));
    expect(res.status).toBe(200);
    expect(dbState.userDocRef.delete).toHaveBeenCalled();
  });

  it('admin global: exclui independente do footprint do alvo (regressão)', async () => {
    getProvisionScopeMock.mockResolvedValueOnce({ allowed: true, global: true, adminClientIds: [] });
    dbState.userDocRef.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'anyone@empresa.com', clientAccess: [] }),
    });
    const res = await DELETE(delReq('anyone'));
    expect(res.status).toBe(200);
    expect(dbState.userDocRef.delete).toHaveBeenCalled();
  });
});
