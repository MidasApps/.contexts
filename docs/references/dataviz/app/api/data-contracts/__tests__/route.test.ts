/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // Single mutable object — closures read state directly (no spread).
  const state = {
    metricsSnapDocs: [] as Array<{ id: string; data: () => { requires: string[]; status?: string } }>,
    contractDocUpdate: vi.fn(async () => undefined),
    contractDocDelete: vi.fn(async () => undefined),
  };

  const batchInstance = {
    delete: vi.fn(),
    commit: vi.fn(async () => undefined),
  };

  const dbInstance = {
    batch: () => batchInstance,
    collection: (name: string) => {
      if (name === 'metrics') {
        return {
          get: async () => ({ docs: state.metricsSnapDocs }),
        };
      }
      // dataContracts
      return {
        doc: () => ({
          update: state.contractDocUpdate,
          delete: state.contractDocDelete,
          collection: () => ({
            get: async () => ({ docs: [] }),
          }),
        }),
      };
    },
  };

  return { state, dbInstance, batchInstance };
});

vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: vi.fn(),
  getAdminFirestore: vi.fn(() => mocks.dbInstance),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async () => ({ email: 'admin@askliquid.com' })),
  })),
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
import { DELETE } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function req(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { authorization: 'Bearer token' },
  });
}

function metricDoc(id: string, requires: string[], status: string = 'active') {
  return { id, data: () => ({ requires, status }) };
}

describe('DELETE /api/data-contracts — hard delete gate', () => {
  beforeEach(() => {
    mocks.state.metricsSnapDocs = [];
    mocks.state.contractDocUpdate.mockClear();
    mocks.state.contractDocDelete.mockClear();
    mocks.batchInstance.delete.mockClear();
    mocks.batchInstance.commit.mockClear();
  });

  it('422 quando métrica referencia atributo do contract (hard=true)', async () => {
    mocks.state.metricsSnapDocs = [
      metricDoc('perf.inadimplencia', ['carteira-base.contratos.saldo_devedor', 'carteira-base.contratos.parcela']),
      metricDoc('risco.ltv', ['outro-contract.entities.attr']),
    ];

    const res = await DELETE(req('http://x/api/data-contracts?id=carteira-base&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe('Contract referenciado por métricas');
    expect(body.dependents).toContain('perf.inadimplencia');
    expect(body.dependents).not.toContain('risco.ltv');
    expect(mocks.state.contractDocDelete).not.toHaveBeenCalled();
  });

  it('200 e executa cascade quando nenhuma métrica referencia o contract (hard=true)', async () => {
    mocks.state.metricsSnapDocs = [
      metricDoc('risco.ltv', ['outro-contract.entities.attr']),
    ];

    const res = await DELETE(req('http://x/api/data-contracts?id=carteira-base&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.contractDocDelete).toHaveBeenCalledOnce();
  });

  it('NÃO bloqueia quando a única métrica que referencia o contract está deprecated', async () => {
    mocks.state.metricsSnapDocs = [
      metricDoc('perf.inadimplencia', ['carteira-base.contratos.saldo'], 'deprecated'),
    ];

    const res = await DELETE(req('http://x/api/data-contracts?id=carteira-base&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.contractDocDelete).toHaveBeenCalledOnce();
  });

  it('bloqueia por métrica ATIVA mesmo havendo uma deprecated que também referencia', async () => {
    mocks.state.metricsSnapDocs = [
      metricDoc('perf.deprecated', ['carteira-base.contratos.saldo'], 'deprecated'),
      metricDoc('perf.ativa', ['carteira-base.contratos.parcela'], 'active'),
    ];

    const res = await DELETE(req('http://x/api/data-contracts?id=carteira-base&hard=true'));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.dependents).toEqual(['perf.ativa']);
    expect(mocks.state.contractDocDelete).not.toHaveBeenCalled();
  });

  it('soft delete não consulta métricas e apenas deprecia', async () => {
    mocks.state.metricsSnapDocs = [
      metricDoc('perf.inadimplencia', ['carteira-base.contratos.saldo']),
    ];

    const res = await DELETE(req('http://x/api/data-contracts?id=carteira-base'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.state.contractDocUpdate).toHaveBeenCalledOnce();
    expect(mocks.state.contractDocDelete).not.toHaveBeenCalled();
  });
});
