import { describe, expect, it } from 'vitest';
import { resolveDatavizDatabaseId } from '@/shared/lib/runtime-config';
import { decidePlaygroundStart, readPlaygroundConfig } from './playground-config';

const TODAY = new Date('2026-09-25T12:00:00Z');

describe('readPlaygroundConfig', () => {
  it('defaults to vila-rosa on the dataviz database, without prod opt-in', () => {
    const cfg = readPlaygroundConfig({}, TODAY);
    expect(cfg).toMatchObject({
      clientId: 'vila-rosa',
      databaseId: 'dataviz',
      allowProd: false,
      dateRange: { start: '2026-01-01', end: '2026-09-25' },
    });
    expect(cfg.dataset).toBeUndefined();
  });

  it('reads the client, dataset, e-mail and database from env', () => {
    const cfg = readPlaygroundConfig({
      MASTRA_DEV_CLIENT_ID: 'imob-demo',
      MASTRA_DEV_DATASET: 'proj.imob',
      MASTRA_DEV_USER_EMAIL: 'dev@example.com',
      DATAVIZ_DATABASE_ID: 'dataviz-dev',
      MASTRA_DEV_ALLOW_PROD: 'true',
    }, TODAY);
    expect(cfg).toMatchObject({
      clientId: 'imob-demo',
      dataset: 'proj.imob',
      userEmail: 'dev@example.com',
      databaseId: 'dataviz-dev',
      allowProd: true,
    });
  });

  it('falls back to NEXT_PUBLIC_DATAVIZ_DATABASE_ID like the app does', () => {
    expect(readPlaygroundConfig({ NEXT_PUBLIC_DATAVIZ_DATABASE_ID: 'x-db' }, TODAY).databaseId).toBe('x-db');
  });

  /*
   * Regressão (review I1): com `DATAVIZ_DATABASE_ID=` vazio — o default do
   * `.env.example` — o `??` do runtime-config NÃO cai para o NEXT_PUBLIC, e o
   * getDb vai para `dataviz`. A guarda precisa ver o mesmo `dataviz`.
   */
  it('sees the production database when DATAVIZ_DATABASE_ID is empty, as getDb does', () => {
    const env = { DATAVIZ_DATABASE_ID: '', NEXT_PUBLIC_DATAVIZ_DATABASE_ID: 'dataviz-dev' };
    const cfg = readPlaygroundConfig(env, TODAY);
    expect(cfg.databaseId).toBe(resolveDatavizDatabaseId(env));
    expect(cfg.databaseId).toBe('dataviz');
    expect(decidePlaygroundStart(cfg).ok).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(() => readPlaygroundConfig({ MASTRA_DEV_DATE_START: '01/01/2026' }, TODAY)).toThrow(/YYYY-MM-DD/);
  });
});

describe('decidePlaygroundStart', () => {
  it('refuses the production database without MASTRA_DEV_ALLOW_PROD', () => {
    const decision = decidePlaygroundStart({ databaseId: 'dataviz', allowProd: false });
    expect(decision.ok).toBe(false);
    expect(decision.ok ? '' : decision.reason).toContain('MASTRA_DEV_ALLOW_PROD=1');
  });

  it('allows the production database with explicit opt-in', () => {
    expect(decidePlaygroundStart({ databaseId: 'dataviz', allowProd: true })).toEqual({ ok: true });
  });

  it('allows any other database', () => {
    expect(decidePlaygroundStart({ databaseId: 'dataviz-dev', allowProd: false })).toEqual({ ok: true });
  });
});
