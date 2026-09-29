/**
 * Testes do scorer `sql_correctness` (Task 3 / Sprint 3.D).
 *
 * Mocka `performDryRun` por fixture (bytes determinísticos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQL_FIXTURES } from '../__fixtures__/sql';
import type { ScorerInput } from '../types';

vi.mock('@/features/ai-agents/tools/bq-dry-run', () => ({
  performDryRun: vi.fn(),
}));

import { performDryRun } from '@/features/ai-agents/tools/bq-dry-run';
import { createSqlCorrectness } from '../sql-correctness';

const baseInput = (sql: string): ScorerInput => ({
  briefing: {
    id: 't',
    templateId: 1,
    personaId: 'controller',
    clientId: 'vila-rosa',
    briefing: 'x',
    expectedKpis: [],
    expectedVisuals: [],
    expectedTopics: [],
  },
  agentOutput: { sql },
  context: { clientId: 'vila-rosa', personaId: 'controller', macroAsOf: '2026-04-01' },
});

describe('sql_correctness', () => {
  beforeEach(() => {
    vi.mocked(performDryRun).mockReset();
  });

  for (const fix of SQL_FIXTURES) {
    it(`${fix.id} → score ∈ [${fix.expectedRange[0]}, ${fix.expectedRange[1]}]`, async () => {
      vi.mocked(performDryRun).mockResolvedValue({
        valid: true,
        bytesProcessed: fix.mockBytes,
      });
      const scorer = createSqlCorrectness();
      const out = await scorer.run(baseInput(fix.sql));
      expect(out.score).toBeGreaterThanOrEqual(fix.expectedRange[0]);
      expect(out.score).toBeLessThanOrEqual(fix.expectedRange[1]);
      expect(out.metadata).toBeDefined();
    });
  }

  it('fall-back para análise estática quando dry-run falha', async () => {
    vi.mocked(performDryRun).mockRejectedValue(new Error('bq down'));
    const scorer = createSqlCorrectness();
    const out = await scorer.run(
      baseInput(
        `SELECT contrato_id FROM \`liquid.contratos\` WHERE data_competencia >= '2024-01-01'`,
      ),
    );
    expect(out.score).toBeGreaterThanOrEqual(0.7);
    expect(out.metadata?.dryRunFallback).toBe(true);
  });

  it('SQL ausente → score 0', async () => {
    const scorer = createSqlCorrectness();
    const out = await scorer.run({
      ...baseInput(''),
      agentOutput: {},
    });
    expect(out.score).toBe(0);
  });
});
