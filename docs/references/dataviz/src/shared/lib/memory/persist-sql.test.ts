import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const embedManyMock = vi.fn().mockResolvedValue({ embeddings: [Array(3072).fill(0.01)] });
const scrubMock = vi.fn((s: string) => s.replace(/\d{11}/g, '***CPF***'));

vi.mock('./recall-store', () => ({
  upsertSqlEmbedding: (...a: unknown[]) => upsertMock(...a),
}));
vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));
vi.mock('@ai-sdk/google-vertex', () => ({
  vertex: { textEmbeddingModel: vi.fn(() => ({ provider: 'vertex' })) },
}));
vi.mock('@/shared/lib/rag/pii-scrubber', () => ({ scrubPii: (s: string) => scrubMock(s) }));

describe('persistSqlGeneration', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    embedManyMock.mockClear();
    scrubMock.mockClear();
  });

  it('skips persistence when rowCount=0', async () => {
    const { persistSqlGeneration } = await import('./persist-sql');
    await persistSqlGeneration({
      clientId: 'OM', personaId: 'originador', intent: 'inadimplencia safra',
      sql: 'SELECT 1', schemaSnapshot: {}, rowCount: 0, latencyMs: 100,
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('skips persistence on error result', async () => {
    const { persistSqlGeneration } = await import('./persist-sql');
    await persistSqlGeneration({
      clientId: 'OM', personaId: 'originador', intent: 'x',
      sql: 'BAD SQL', schemaSnapshot: {}, rowCount: 0, latencyMs: 50,
      error: 'syntax',
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('scrubs PII before embedding and upsert', async () => {
    const { persistSqlGeneration } = await import('./persist-sql');
    await persistSqlGeneration({
      clientId: 'OM', personaId: 'originador', intent: 'cpf 12345678901',
      sql: "SELECT * FROM x WHERE cpf = '12345678901'",
      schemaSnapshot: { table: 'x' }, rowCount: 5, latencyMs: 200,
    });
    expect(scrubMock).toHaveBeenCalled();
    const arg = upsertMock.mock.calls[0][0];
    expect(arg.sqlText).not.toMatch(/12345678901/);
    expect(arg.sqlText).toMatch(/\*\*\*CPF\*\*\*/);
  });

  it('persists with required metadata fields', async () => {
    const { persistSqlGeneration } = await import('./persist-sql');
    await persistSqlGeneration({
      clientId: 'OM', personaId: 'originador', intent: 'safra',
      sql: 'SELECT 1', schemaSnapshot: { table: 't' }, rowCount: 10, latencyMs: 150,
      glossaryVersion: 'v3', regulatoryPackVersion: 'cvm60-2026-04',
    });
    const arg = upsertMock.mock.calls[0][0];
    expect(arg).toMatchObject({
      clientId: 'OM', personaId: 'originador',
      glossaryVersion: 'v3', regulatoryPackVersion: 'cvm60-2026-04',
      rowCount: 10, latencyMs: 150,
    });
  });
});
