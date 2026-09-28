/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    relationsDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
    relationSet: vi.fn(async () => undefined),
    relationDelete: vi.fn(async () => undefined),
    relationExists: false,
  };
  const dbInstance = {
    collection: (name: string) => {
      if (name === 'relations') {
        return {
          get: async () => ({ docs: state.relationsDocs }),
          doc: () => ({
            set: state.relationSet,
            delete: state.relationDelete,
            get: async () => ({ exists: state.relationExists }),
          }),
        };
      }
      return { get: async () => ({ docs: [] }) };
    },
  };
  return { state, dbInstance };
});

vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: vi.fn(),
  getAdminFirestore: vi.fn(() => mocks.dbInstance),
  getDb: vi.fn(() => mocks.dbInstance),
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn(async () => ({ email: 'admin@askliquid.com' })) })),
}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
}));
vi.mock('@/shared/lib/runtime-config', () => ({
  DATAVIZ_DATABASE_ID: 'test-db',
  DEV_BYPASS_EMAIL: 'admin@askliquid.com',
  isAdminEmail: vi.fn(() => true),
  isDevAuthBypassEnabled: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../route';

const auth = { authorization: 'Bearer t' };
const getReq = () => new NextRequest('http://x/api/relations', { headers: auth });
const postReq = (body: unknown) =>
  new NextRequest('http://x/api/relations', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.state.relationsDocs = [];
  mocks.state.relationSet.mockClear();
  mocks.state.relationDelete.mockClear();
  mocks.state.relationExists = false;
});

describe('/api/relations', () => {
  it('GET lista as relações', async () => {
    mocks.state.relationsDocs = [
      { id: 'r1', data: () => ({ label: 'L', leftRef: 'a.b.c', rightRef: 'd.e.f', cardinality: 'many-to-one' }) },
    ];
    const res = await GET(getReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].id).toBe('r1');
  });

  it('POST valida e faz upsert', async () => {
    const res = await POST(
      postReq({
        id: 'contrato-cliente',
        label: 'C→Cli',
        leftRef: 'contratos.contratos.cliente_id',
        rightRef: 'clientes.proponentes.id',
        cardinality: 'many-to-one',
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.state.relationSet).toHaveBeenCalled();
  });

  it('POST rejeita payload inválido (ref 2-part)', async () => {
    const res = await POST(
      postReq({ id: 'x', label: 'X', leftRef: 'a.b', rightRef: 'd.e.f', cardinality: 'many-to-one' }),
    );
    expect(res.status).toBe(400);
  });

  it('DELETE remove', async () => {
    const res = await DELETE(
      new NextRequest('http://x/api/relations?id=r1', { method: 'DELETE', headers: auth }),
    );
    expect(res.status).toBe(200);
    expect(mocks.state.relationDelete).toHaveBeenCalled();
  });
});
