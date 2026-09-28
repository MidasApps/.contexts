import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDbMock = vi.fn();
const isAdminEmailMock = vi.fn();

vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })) }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: (...a: unknown[]) => getDbMock(...a) }));
vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: (...a: unknown[]) => isAdminEmailMock(...a),
  isDevAuthBypassEnabled: vi.fn(() => false),
  DEV_BYPASS_EMAIL: 'dev@local',
}));

import { verifyCanProvision, getProvisionScope } from './api-auth';

/** getDb() stub: users por email com adminClientIds. */
function buildDb(users: Record<string, Record<string, unknown>>) {
  return {
    collection() {
      return {
        where(_f: string, _op: string, value: string) {
          return {
            limit() {
              return {
                async get() {
                  const entry = users[value];
                  const docs = entry ? [{ id: value, data: () => entry }] : [];
                  return { empty: docs.length === 0, docs };
                },
              };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  getDbMock.mockReset();
  isAdminEmailMock.mockReset();
  isAdminEmailMock.mockReturnValue(false);
});

describe('getProvisionScope', () => {
  it('admin global → allowed + global, sem tocar Firestore', async () => {
    isAdminEmailMock.mockReturnValue(true);
    const s = await getProvisionScope('admin@askliquid.com');
    expect(s).toEqual({ allowed: true, global: true, adminClientIds: [] });
    expect(getDbMock).not.toHaveBeenCalled();
  });
  it('caller sem doc → 403', async () => {
    getDbMock.mockReturnValue(buildDb({}));
    const s = await getProvisionScope('ghost@empresa.com');
    expect(s).toMatchObject({ allowed: false, status: 403 });
  });
  it('caller com adminClientIds vazio → 403', async () => {
    getDbMock.mockReturnValue(buildDb({ 'c@empresa.com': { email: 'c@empresa.com', adminClientIds: [] } }));
    const s = await getProvisionScope('c@empresa.com');
    expect(s).toMatchObject({ allowed: false, status: 403 });
  });
  it('clientAdmin válido → allowed + escopo', async () => {
    getDbMock.mockReturnValue(buildDb({ 'c@empresa.com': { email: 'c@empresa.com', adminClientIds: ['vila-rosa'] } }));
    const s = await getProvisionScope('c@empresa.com');
    expect(s).toEqual({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
  });
});

describe('verifyCanProvision — barreiras (fail-closed)', () => {
  const caller = 'c@empresa.com';
  beforeEach(() => {
    getDbMock.mockReturnValue(buildDb({ [caller]: { email: caller, adminClientIds: ['vila-rosa'] } }));
  });

  it('admin global provisiona qualquer target', async () => {
    isAdminEmailMock.mockImplementation((e?: string) => e === 'admin@askliquid.com');
    const r = await verifyCanProvision('admin@askliquid.com', {
      email: 'x@empresa.com', clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }],
    });
    expect(r).toEqual({ allowed: true, global: true, adminClientIds: [] });
  });

  it('clientAdmin de {vila-rosa} cria target [vila-rosa] → allowed', async () => {
    const r = await verifyCanProvision(caller, { email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] });
    expect(r).toMatchObject({ allowed: true, global: false });
  });

  it('clientAdmin cria target [vila-rosa, om] (om fora) → 403', async () => {
    const r = await verifyCanProvision(caller, {
      email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });

  it('clientAdmin tenta criar admin global (email @askliquid.com) → 403 [V1]', async () => {
    isAdminEmailMock.mockImplementation((e?: string) => (e ?? '').endsWith('@askliquid.com'));
    const r = await verifyCanProvision(caller, { email: 'evil@askliquid.com', clientAccess: [{ clientId: 'vila-rosa' }] });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });

  it('clientAdmin sub-delega adminClientIds fora do escopo → 403', async () => {
    const r = await verifyCanProvision(caller, {
      email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'],
    });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });
});
