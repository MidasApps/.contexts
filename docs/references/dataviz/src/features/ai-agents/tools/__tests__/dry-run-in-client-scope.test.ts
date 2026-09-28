import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ scope: vi.fn(), check: vi.fn() }));
vi.mock('@/features/ai-agents/lib/client-query-scope', () => ({
  catalogQueryScope: (...a: unknown[]) => h.scope(...a),
}));
vi.mock('@/features/ai-agents/lib/tenant-query', () => ({
  checkTenantQuery: (...a: unknown[]) => h.check(...a),
}));
vi.mock('@/shared/lib/bigquery/client', () => ({ getBigQueryClient: vi.fn() }));

import { dryRunInClientScope } from '../bq-dry-run';

const SCOPE = { defaultDataset: 'p.ds', allowed: [{ projectId: 'p', datasetId: 'ds' }] };

describe('dryRunInClientScope', () => {
  beforeEach(() => {
    h.scope.mockReset().mockResolvedValue(SCOPE);
    h.check.mockReset();
  });

  it('validates in the scope of the entry\'s client, like execute_sql', async () => {
    h.check.mockResolvedValueOnce({ ok: true, sql: 'SELECT 1', bytes: 42, schema: [{ name: 'x', type: 'INT64', mode: 'NULLABLE' }] });

    const r = await dryRunInClientScope('SELECT 1', 'vila-rosa');

    expect(h.scope).toHaveBeenCalledWith('vila-rosa');
    expect(h.check).toHaveBeenCalledWith('SELECT 1', SCOPE);
    expect(r).toEqual({ valid: true, bytesProcessed: 42, statementType: 'SELECT', schema: [{ name: 'x', type: 'INT64', mode: 'NULLABLE' }] });
  });

  it('refuses without running a dry run when the client has no bound dataset', async () => {
    h.scope.mockResolvedValueOnce(null);

    const r = await dryRunInClientScope('SELECT 1', 'sem-binding');

    expect(r.valid).toBe(false);
    expect(h.check).not.toHaveBeenCalled();
  });

  it.each([
    ['FORA_DO_TENANT', 'reference'],
    ['DRY_RUN_FALHOU', 'syntax'],
    ['SQL_RECUSADO', 'forbidden'],
    ['NAO_E_SELECT', 'forbidden'],
  ])('maps the %s refusal to the %s error class', async (code, errorClass) => {
    h.check.mockResolvedValueOnce({ ok: false, code, error: 'recusado' });

    expect(await dryRunInClientScope('SELECT 1', 'vila-rosa')).toEqual({ valid: false, error: 'recusado', errorClass });
  });
});
