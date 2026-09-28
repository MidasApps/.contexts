/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, isAdminEmailMock, state, authMock } = vi.hoisted(() => ({
  verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'c@empresa.com'),
  isAdminEmailMock: vi.fn((e?: string) => (e ?? '').endsWith('@askliquid.com')),
  state: {
    // users por email (para getProvisionScope) e por id (doc), clients, groups
    usersByEmail: {} as Record<string, { id: string; data: Record<string, unknown> }>,
    usersById: {} as Record<string, Record<string, unknown>>,
    clientIds: ['vila-rosa', 'om', 'brz'],
    groupIds: [] as string[],
    lastSet: null as Record<string, unknown> | null,
    deleted: [] as string[],
  },
  // Instância ÚNICA e estável (ao contrário de recriar por chamada) para que
  // os testes C1 (review final) possam afirmar sobre createUser/getUserByEmail.
  authMock: {
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-x', customClaims: {} })),
    createUser: vi.fn(async () => ({ uid: 'uid-x' })),
    setCustomUserClaims: vi.fn(async () => undefined),
    generatePasswordResetLink: vi.fn(async () => 'https://reset/x'),
  },
}));

// Só verifyAuthToken é mockado; verifyCanProvision/getProvisionScope rodam REAIS.
vi.mock('@/shared/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/api-auth')>();
  return { ...actual, verifyAuthToken: verifyAuthTokenMock };
});
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: (email?: string) => isAdminEmailMock(email) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({})) }));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) } }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => buildDb(),
  getAdminAuth: () => authMock,
}));

function buildDb() {
  return {
    collection(name: string) {
      if (name === 'clients') return { get: async () => ({ docs: state.clientIds.map((id) => ({ id })) }) };
      if (name === 'groups') return { get: async () => ({ docs: state.groupIds.map((id) => ({ id })) }) };
      // users
      return {
        where(_f: string, _op: string, value: string) {
          return { limit: () => ({ get: async () => {
            const u = state.usersByEmail[value];
            return { empty: !u, docs: u ? [{ id: u.id, data: () => u.data }] : [] };
          } }) };
        },
        get: async () => ({ docs: Object.entries(state.usersById).map(([id, data]) => ({ id, data: () => data })) }),
        doc(id: string) {
          return {
            get: async () => ({ exists: !!state.usersById[id], data: () => state.usersById[id] ?? {} }),
            set: async (payload: Record<string, unknown>) => { state.lastSet = payload; state.usersById[id] = { ...(state.usersById[id] ?? {}), ...payload }; },
            delete: async () => { state.deleted.push(id); delete state.usersById[id]; },
          };
        },
      };
    },
  };
}

import { NextRequest } from 'next/server';
import { POST, GET, DELETE } from '../route';

function post(body: unknown, caller = 'c@empresa.com'): NextRequest {
  verifyAuthTokenMock.mockResolvedValueOnce(caller);
  return new Request('http://localhost/api/users', {
    method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function getReq(): NextRequest {
  return new Request('http://localhost/api/users', { headers: { authorization: 'Bearer t' } }) as unknown as NextRequest;
}

function delReq(id: string): NextRequest {
  return new Request(`http://localhost/api/users?id=${id}`, { method: 'DELETE', headers: { authorization: 'Bearer t' } }) as unknown as NextRequest;
}

beforeEach(() => {
  isAdminEmailMock.mockImplementation((e?: string) => (e ?? '').endsWith('@askliquid.com'));
  state.usersByEmail = {
    'c@empresa.com': { id: 'c_empresa_com', data: { email: 'c@empresa.com', adminClientIds: ['vila-rosa'] } },
  };
  state.usersById = {};
  state.lastSet = null;
  state.deleted = [];
  authMock.getUserByEmail.mockClear();
  authMock.createUser.mockClear();
  authMock.setCustomUserClaims.mockClear();
  authMock.generatePasswordResetLink.mockClear();
});

describe('adversarial — clientAdmin (V1–V6)', () => {
  it('V1a: clientAdmin concede tenant fora do escopo → 403', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'om' }] }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull(); // nenhum efeito
  });

  it('V1b: clientAdmin cria admin global (@askliquid.com) → 403', async () => {
    const res = await POST(post({ id: 'evil_askliquid_com', email: 'evil@askliquid.com', displayName: 'E', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull();
  });

  it('V1c: clientAdmin auto-promove adminClientIds fora do escopo → 403', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull();
  });

  it('caminho feliz: clientAdmin cria usuário só no seu tenant → 200', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(200);
    expect((state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId)).toEqual(['vila-rosa']);
  });

  it('V1d: edição cross-tenant preserva a entrada fora do escopo (om intacto)', async () => {
    state.usersById['u_empresa_com'] = { email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om', routeOverrides: ['/dashboard'] }] };
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(200);
    const tenants = (state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(tenants).toEqual(['om', 'vila-rosa']);
  });

  it('C1 exploit (CRITICAL, review final): clientAdmin de vila-rosa NÃO herda clientAccess de doc de outro tenant via id alheio + email fresh', async () => {
    // Doc real de um usuário 'om', fora do escopo do caller (vila-rosa).
    state.usersById['om_user_com'] = { email: 'omuser@om.com', clientAccess: [{ clientId: 'om' }] };
    const res = await POST(post({
      id: 'om_user_com', // id do doc alheio (usuário 'om' existente)
      email: 'attacker-fresh@empresa.com', // email fresh, sem doc/conta, sob controle do atacante
      displayName: 'Attacker', groups: [], clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect([400, 403]).toContain(res.status);
    expect(state.lastSet).toBeNull(); // nenhum efeito
    // doc do usuário 'om' permanece intacto (não foi sequestrado/renomeado)
    expect(state.usersById['om_user_com']).toEqual({ email: 'omuser@om.com', clientAccess: [{ clientId: 'om' }] });
    expect(authMock.createUser).not.toHaveBeenCalled();
  });

  it('C1b (CRITICAL, review final): clientAdmin de vila-rosa edita doc existente com footprint inteiramente de outro tenant (om, sem overlap) → 403, sem efeito', async () => {
    state.usersById['omuser_empresa_com'] = { email: 'omuser@empresa.com', clientAccess: [{ clientId: 'om' }] };
    const res = await POST(post({
      id: 'omuser_empresa_com', email: 'omuser@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull();
    expect(state.usersById['omuser_empresa_com']).toEqual({ email: 'omuser@empresa.com', clientAccess: [{ clientId: 'om' }] });
  });

  it('C1 colisão de slug + overlap (exploit real, review final 2): clientAdmin de vila-rosa POSTa id de doc compartilhado com email-colisão fresh → 400, sem efeito, doc de alice intacto', async () => {
    // Doc real e compartilhado de alice: vila-rosa (no escopo do caller) + om (fora).
    // slugifyEmail é NÃO-injetivo: 'alice.sub@acme.com' e 'alice@sub.acme.com'
    // colapsam no MESMO id 'alice_sub_acme_com', então o guard C1a (id===slug(email))
    // é satisfeito por um email-colisão que o atacante controla, apontando para o
    // doc de alice. Sem o FIX #1 o merge herdaria [om] p/ o claim da conta fresh.
    state.usersById['alice_sub_acme_com'] = {
      email: 'alice@sub.acme.com',
      clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    };
    const res = await POST(post({
      id: 'alice_sub_acme_com',
      email: 'alice.sub@acme.com', // colisão fresh, sem doc/conta, sob controle do atacante
      displayName: 'Attacker', groups: [], clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(400);
    expect(state.lastSet).toBeNull(); // nenhum efeito colateral
    // doc de alice intacto: email e clientAccess (incluindo om) preservados
    expect(state.usersById['alice_sub_acme_com']).toEqual({
      email: 'alice@sub.acme.com',
      clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    });
    expect(authMock.createUser).not.toHaveBeenCalled();
    expect(authMock.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('#2 (Important, review final 2): clientAdmin de vila-rosa editando doc compartilhado [vila-rosa,om] NÃO altera groups nem displayName (campos globais preservados)', async () => {
    state.groupIds = ['analyst', 'admin-group']; // refs válidas p/ passar a validação de grupos
    state.usersById['shared_empresa_com'] = {
      email: 'shared@empresa.com',
      displayName: 'Nome Original',
      groups: ['analyst'],
      clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    };
    const res = await POST(post({
      id: 'shared_empresa_com',
      email: 'shared@empresa.com', // email correto (não dispara FIX #1)
      displayName: 'Nome Hackeado',
      groups: ['admin-group'], // tentativa de trocar rotas globais de um usuário de outro tenant
      clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(200);
    // campos globais preservados do doc existente (body ignorado p/ esses campos)
    expect(state.lastSet!.groups).toEqual(['analyst']);
    expect(state.lastSet!.displayName).toEqual('Nome Original');
    // om preservado no merge por-tenant (comportamento legítimo mantido)
    const tenants = (state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(tenants).toEqual(['om', 'vila-rosa']);
  });

  it('V6a: GET por clientAdmin lista só usuários no escopo', async () => {
    state.usersById = {
      a: { email: 'a@e.com', clientAccess: [{ clientId: 'vila-rosa' }] },
      b: { email: 'b@e.com', clientAccess: [{ clientId: 'om' }] },
    };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.map((u: { id: string }) => u.id)).toEqual(['a']);
  });

  it('V6b: DELETE por clientAdmin de alvo fora do escopo → 403', async () => {
    state.usersById['b'] = { email: 'b@e.com', clientAccess: [{ clientId: 'om' }] };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await DELETE(delReq('b'));
    expect(res.status).toBe(403);
    expect(state.deleted).not.toContain('b');
  });

  it('regressão: admin global mantém acesso total (V7 — sem regressão de isolamento)', async () => {
    const res = await POST(post({ id: 'any_com', email: 'any@empresa.com', displayName: 'A', groups: [], clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }] }, 'admin@askliquid.com'));
    expect(res.status).toBe(200);
    expect((state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort()).toEqual(['brz', 'om']);
  });
});

// Cobertura do fix do T3 (commit 8020286): footprint do alvo = clientAccess ∪
// adminClientIds; vazio ou fora do escopo nunca é vacuamente "permitido"
// (isSubset([], x) seria true e vazaria o alvo). Gate: se qualquer caso aqui
// virar 200/listado/excluído, é regressão do fail-open que foi corrigido.
describe('adversarial — GET/DELETE footprint fail-open (regressão do fix T3)', () => {
  it('V6c: GET exclui alvo com clientAccess vazio (ex.: admin global sem acesso por-tenant)', async () => {
    state.usersById = {
      'no-access': { email: 'ninguem@empresa.com', clientAccess: [] },
      'in-scope': { email: 'user@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] },
    };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.map((u: { id: string }) => u.id)).toEqual(['in-scope']);
  });

  it('V6d: GET exclui alvo com adminClientIds fora do escopo mesmo com clientAccess em escopo', async () => {
    state.usersById = {
      'admin-om': { email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] },
      'in-scope': { email: 'user@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] },
    };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.map((u: { id: string }) => u.id)).toEqual(['in-scope']);
  });

  it('V6e: DELETE de alvo com clientAccess vazio → 403, nada excluído', async () => {
    state.usersById['alvo-vazio'] = { email: 'admin-global@empresa.com', clientAccess: [] };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await DELETE(delReq('alvo-vazio'));
    expect(res.status).toBe(403);
    expect(state.deleted).not.toContain('alvo-vazio');
  });

  it('V6f: DELETE de alvo com adminClientIds fora do escopo (clientAccess em escopo) → 403, nada excluído', async () => {
    state.usersById['admin-om'] = { email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await DELETE(delReq('admin-om'));
    expect(res.status).toBe(403);
    expect(state.deleted).not.toContain('admin-om');
  });

  it('V7b: GET por admin global lista todos independente do footprint (sem regressão)', async () => {
    state.usersById = {
      'no-access': { email: 'ninguem@empresa.com', clientAccess: [] },
      'admin-om': { email: 'admin-om@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] },
    };
    verifyAuthTokenMock.mockResolvedValueOnce('admin@askliquid.com');
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.data.map((u: { id: string }) => u.id).sort()).toEqual(['admin-om', 'no-access']);
  });

  it('V7c: DELETE por admin global exclui independente do footprint do alvo (sem regressão)', async () => {
    state.usersById['anyone'] = { email: 'anyone@empresa.com', clientAccess: [] };
    verifyAuthTokenMock.mockResolvedValueOnce('admin@askliquid.com');
    const res = await DELETE(delReq('anyone'));
    expect(res.status).toBe(200);
    expect(state.deleted).toContain('anyone');
  });
});

// Cobertura do fix do vetor 3f (review final 3): um caller NÃO-global não pode
// BOOTSTRAPAR credencial (createUser + resetLink + claim em conta NOVA) de um
// usuário que não é 100% do seu escopo. Pré-condição do ataque: doc EXISTENTE
// compartilhado (footprint ⊄ escopo) + conta Auth AUSENTE + email REAL da vítima
// (não dispara o guard de email-match #1). Gate: só bootstrapa quando caller
// global, OU doc novo (incoming já validado ⊆ escopo), OU footprint do doc
// existente é INTEIRAMENTE ⊆ escopo.
describe('adversarial — bootstrap de credencial por escopo (vetor 3f)', () => {
  it('3f (CRITICAL, review final 3): clientAdmin de vila-rosa NÃO bootstrapa credencial de usuário compartilhado [vila-rosa,om] sem conta Auth — email real bate, mas om está fora do escopo', async () => {
    // Doc compartilhado de alice: vila-rosa (no escopo do caller) + om (fora). SEM conta Auth.
    state.usersById['alice_empresa_com'] = {
      email: 'alice@empresa.com',
      displayName: 'Alice',
      clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    };
    // Conta Auth de alice ainda NÃO existe (provisionCredential:false out-of-band / deletada).
    authMock.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });

    const res = await POST(post({
      id: 'alice_empresa_com',
      email: 'alice@empresa.com', // email REAL da vítima → guard de email-match #1 NÃO dispara
      displayName: 'Alice',
      groups: [],
      clientAccess: [{ clientId: 'vila-rosa' }],
    }));

    // Request NÃO é derrubado — o merge in-scope do doc segue normalmente.
    expect(res.status).toBe(200);
    const body = await res.json();
    // NENHUMA credencial bootstrapada: sem conta nova, sem claim em conta nova, sem link ao atacante.
    expect(authMock.createUser).not.toHaveBeenCalled();
    expect(authMock.setCustomUserClaims).not.toHaveBeenCalled();
    expect(authMock.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(body.resetLink).toBeUndefined();
    expect(body.credentialCreated).toBe(false);
    // Merge por-tenant preservado: om intacto, vila-rosa aplicado.
    const tenants = (state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(tenants).toEqual(['om', 'vila-rosa']);
  });

  it('regressão positiva (review final 3): clientAdmin de vila-rosa cria usuário NOVO totalmente in-scope → bootstrapa credencial (createUser + resetLink)', async () => {
    // Doc inexistente + conta ausente: capability legítima do clientAdmin.
    authMock.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const res = await POST(post({
      id: 'novo_empresa_com',
      email: 'novo@empresa.com',
      displayName: 'Novo',
      groups: [],
      clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(authMock.createUser).toHaveBeenCalled();
    expect(authMock.setCustomUserClaims).toHaveBeenCalled();
    expect(body.credentialCreated).toBe(true);
    expect(body.resetLink).toBe('https://reset/x');
  });

  it('regressão (review final 3): admin global bootstrapa credencial de doc compartilhado alheio (inalterado)', async () => {
    // Doc compartilhado [om,brz], footprint fora de qualquer escopo restrito — mas global não tem gate.
    state.usersById['bob_empresa_com'] = {
      email: 'bob@empresa.com',
      displayName: 'Bob',
      clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }],
    };
    authMock.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    const res = await POST(post({
      id: 'bob_empresa_com',
      email: 'bob@empresa.com',
      displayName: 'Bob',
      groups: [],
      clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }],
    }, 'admin@askliquid.com'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(authMock.createUser).toHaveBeenCalled();
    expect(body.credentialCreated).toBe(true);
    expect(body.resetLink).toBe('https://reset/x');
  });
});
