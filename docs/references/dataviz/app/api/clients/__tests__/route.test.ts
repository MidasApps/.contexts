/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for POST /api/clients
 *
 * Key scenarios:
 * (a) New-model client with productBindings (no top-level dataset) → 200 (no longer 400)
 * (b) Legacy client without dataset AND without productBindings → still 400
 * (c) Malformed body → 400 with Zod issues
 */

const { verifyAuthTokenMock, isAdminEmailMock, dbState } = vi.hoisted(() => {
  const docRef = {
    get: vi.fn(async () => ({ exists: false })),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const colRef = {
    doc: vi.fn(() => docRef),
    get: vi.fn(async () => ({ docs: [] })),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  const batchRef = {
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  };
  return {
    verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'admin@askliquid.com'),
    isAdminEmailMock: vi.fn(() => true),
    dbState: {
      collection: vi.fn(() => colRef),
      batch: vi.fn(() => batchRef),
      colRef,
      docRef,
      batchRef,
    },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: verifyAuthTokenMock }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => dbState }));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/clients', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** Minimal valid new-model payload (productBindings, no top-level dataset). */
const newModelPayload = {
  id: 'acme-corp',
  name: 'Acme Corp',
  initial: 'AC',
  color: '#1a2b3c',
  productBindings: [
    {
      productId: 'credit',
      datasets: [
        {
          id: 'ds-main',
          dataSourceId: 'bq-prod',
          datasetId: 'acme_credit',
        },
      ],
    },
  ],
};

/** Minimal valid legacy payload (top-level dataset, no productBindings). */
const legacyPayload = {
  id: 'legacy-corp',
  name: 'Legacy Corp',
  initial: 'LC',
  color: '#aabbcc',
  dataset: 'legacy_dataset',
};

describe('POST /api/clients', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
    isAdminEmailMock.mockReturnValue(true);
    dbState.collection.mockClear();
    dbState.docRef.set.mockClear();
    dbState.docRef.get.mockResolvedValue({ exists: false });
  });

  it('(a) new-model client with productBindings and no top-level dataset → 200', async () => {
    const res = await POST(req(newModelPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(dbState.docRef.set).toHaveBeenCalled();
  });

  it('(b) legacy client without dataset and without productBindings → 400', async () => {
    const payload = { id: 'no-dataset-corp', name: 'No Dataset', initial: 'ND', color: '#123456' };
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/dataset/i);
  });

  it('(c) malformed body (missing required fields) → 400 with issues', async () => {
    // Missing name, initial — Zod should reject
    const res = await POST(req({ id: 'bad-client', color: '#aabbcc' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Payload inválido');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('(c2) completely empty body → 400 with issues', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inválido/i);
  });

  it('(d) legacy client WITH dataset → 200', async () => {
    const res = await POST(req(legacyPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(dbState.docRef.set).toHaveBeenCalled();
  });

  it('401 without auth', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce(null);
    const res = await POST(req(newModelPayload));
    expect(res.status).toBe(401);
  });

  it('403 for non-admin user', async () => {
    isAdminEmailMock.mockReturnValueOnce(false);
    const res = await POST(req(newModelPayload));
    expect(res.status).toBe(403);
  });

  it('400 with invalid hex color', async () => {
    const res = await POST(req({ ...legacyPayload, id: 'color-test', color: 'red' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cor/i);
  });

  it('400 with invalid client id (not kebab-case)', async () => {
    const res = await POST(req({ ...legacyPayload, id: 'INVALID_ID' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/id/i);
  });
});
