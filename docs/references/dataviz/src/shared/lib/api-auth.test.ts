/**
 * Focused tests for verifyDatasetAccess — multi-tenant isolation (ADR-0006).
 *
 * Covers the new preferred `clientId` path (direct client doc lookup +
 * dataset-ownership check via legacy field OR productBindings + clientAccess
 * cross-check) and the legacy back-compat path (lookup by `dataset` field).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const getDbMock = vi.fn();
const isAdminEmailMock = vi.fn();

// api-auth imports firebase-admin/auth (getAuth) and getDb at module load.
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
}));

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: (...a: unknown[]) => getDbMock(...a),
}));

vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: (...a: unknown[]) => isAdminEmailMock(...a),
  isDevAuthBypassEnabled: vi.fn(() => false),
  DEV_BYPASS_EMAIL: 'dev@local',
}));

import { verifyDatasetAccess } from './api-auth';

// ── Firestore fake builder ──────────────────────────────────────────────────
//
// Builds a getDb() stub backed by in-memory data:
//   users  — by email (query .where('email','==',e).limit(1).get())
//   clients by id (doc(id).get()) AND by legacy dataset (where('dataset','==',ds))

interface FakeData {
  /** email -> user doc data */
  users: Record<string, Record<string, unknown>>;
  /** clientId -> client doc data */
  clients: Record<string, Record<string, unknown>>;
}

function buildDb(data: FakeData) {
  function userQuery(email: string) {
    const entry = data.users[email];
    const docs = entry ? [{ id: email, data: () => entry }] : [];
    return { empty: docs.length === 0, docs };
  }

  function clientsByDataset(dataset: string) {
    const matches = Object.entries(data.clients).filter(
      ([, d]) => d.dataset === dataset,
    );
    const docs = matches.map(([id, d]) => ({ id, data: () => d }));
    return { empty: docs.length === 0, docs };
  }

  return {
    collection(name: string) {
      if (name === 'users') {
        return {
          where(_field: string, _op: string, value: string) {
            return {
              limit() {
                return { async get() { return userQuery(value); } };
              },
            };
          },
        };
      }
      // clients
      return {
        doc(id: string) {
          return {
            async get() {
              const d = data.clients[id];
              return {
                exists: d !== undefined,
                id,
                data: () => d,
              };
            },
          };
        },
        where(_field: string, _op: string, value: string) {
          return {
            limit() {
              return { async get() { return clientsByDataset(value); } };
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

describe('verifyDatasetAccess — admin bypass', () => {
  it('allows admins without touching Firestore', async () => {
    isAdminEmailMock.mockReturnValue(true);
    const res = await verifyDatasetAccess('admin@askliquid.com', 'om_dataset', 'client-om');
    expect(res).toEqual({ allowed: true });
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

describe('verifyDatasetAccess — invalid input', () => {
  it('rejects an empty dataset', async () => {
    const res = await verifyDatasetAccess('user@example.com', '   ');
    expect(res).toEqual({ allowed: false, error: 'Dataset inválido', status: 400 });
  });
});

describe('verifyDatasetAccess — new clientId path (productBindings)', () => {
  it('allows when dataset belongs via productBindings AND user has clientAccess', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-om' }] },
        },
        clients: {
          'client-om': {
            // NO legacy `dataset` field — new format only
            productBindings: [
              { datasets: [{ datasetId: 'om_dataset' }] },
            ],
          },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset', 'client-om');
    expect(res).toEqual({ allowed: true });
  });

  it('denies (403) when the new-format client exists but user lacks clientAccess', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-other' }] },
        },
        clients: {
          'client-om': {
            productBindings: [{ datasets: [{ datasetId: 'om_dataset' }] }],
          },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset', 'client-om');
    expect(res).toEqual({
      allowed: false,
      error: 'Sem permissão para este cliente',
      status: 403,
    });
  });

  it('denies (403) when the dataset does not belong to the client', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-om' }] },
        },
        clients: {
          'client-om': {
            productBindings: [{ datasets: [{ datasetId: 'om_dataset' }] }],
          },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'someone_elses_dataset', 'client-om');
    expect(res).toEqual({
      allowed: false,
      error: 'Dataset não pertence ao cliente',
      status: 403,
    });
  });

  it('denies (403) when the client does not exist', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: { 'user@example.com': { email: 'user@example.com', clientAccess: [] } },
        clients: {},
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset', 'nope');
    expect(res).toEqual({ allowed: false, error: 'Cliente não encontrado', status: 403 });
  });

  it('denies (403) when the user is not configured', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {},
        clients: {
          'client-om': { productBindings: [{ datasets: [{ datasetId: 'om_dataset' }] }] },
        },
      }),
    );

    const res = await verifyDatasetAccess('ghost@example.com', 'om_dataset', 'client-om');
    expect(res).toEqual({ allowed: false, error: 'Usuário não configurado', status: 403 });
  });

  it('allows when dataset belongs via the legacy `dataset` field on the client doc', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-om' }] },
        },
        clients: {
          'client-om': { dataset: 'om_dataset' },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset', 'client-om');
    expect(res).toEqual({ allowed: true });
  });
});

describe('verifyDatasetAccess — legacy path (no clientId, back-compat)', () => {
  it('allows when the user has access to the client matched by legacy dataset field', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-om' }] },
        },
        clients: {
          'client-om': { dataset: 'om_dataset' },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset');
    expect(res).toEqual({ allowed: true });
  });

  it('denies (403) when the user lacks access to the matched client', async () => {
    getDbMock.mockReturnValue(
      buildDb({
        users: {
          'user@example.com': { email: 'user@example.com', clientAccess: [{ clientId: 'client-other' }] },
        },
        clients: {
          'client-om': { dataset: 'om_dataset' },
        },
      }),
    );

    const res = await verifyDatasetAccess('user@example.com', 'om_dataset');
    expect(res).toEqual({
      allowed: false,
      error: 'Sem permissão para este cliente',
      status: 403,
    });
  });
});
