/**
 * Sprint 3.A Task 15 — Eval semantic recall (gold dataset 50 reuses).
 *
 * Two modes:
 *   --mode=seed  Persists each seed_sql via persistSqlGeneration.
 *   --mode=test  For each test_intent, runs querySqlEmbeddings via the same
 *                vertex embedding model used by recall_similar_sql.
 *                Counts hit if top-1 normalized sqlText == scrubPii(seed_sql).
 *                Exits 1 if hitRate < 0.40.
 *
 * Usage:
 *   pnpm tsx scripts/eval-semantic-recall.ts --mode=seed [--allow-prod]
 *   pnpm tsx scripts/eval-semantic-recall.ts --mode=test
 *
 * `--mode=seed` grava no Firestore (`embeddingsSql`); no banco `dataviz`
 * (produção) exige `--allow-prod`. `--mode=test` só lê.
 */

import { readFileSync } from 'node:fs';
import { embed } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { persistSqlGeneration } from '../src/shared/lib/memory/persist-sql';
import { querySqlEmbeddings } from '../src/shared/lib/memory/recall-store';
import { scrubPii } from '../src/shared/lib/rag/pii-scrubber';
import { DATAVIZ_DATABASE_ID } from '../src/shared/lib/runtime-config';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

interface GoldEntry {
  id: string;
  clientId: string;
  personaId: string;
  seed_intent: string;
  seed_sql: string;
  test_intents: string[];
}

const HIT_RATE_THRESHOLD = 0.4;

function parseArgs(): { mode: 'seed' | 'test' } {
  const arg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = arg?.split('=')[1];
  if (mode !== 'seed' && mode !== 'test') {
    console.error('Usage: eval-semantic-recall.ts --mode=seed|test');
    process.exit(2);
  }
  return { mode };
}

function loadGold(): GoldEntry[] {
  const raw = readFileSync('docs/eval/gold-sql-reuses.json', 'utf8');
  return JSON.parse(raw) as GoldEntry[];
}

async function seedAll(gold: GoldEntry[]): Promise<void> {
  console.log(`[seed] persisting ${gold.length} seed SQLs...`);
  let ok = 0;
  for (const g of gold) {
    await persistSqlGeneration({
      clientId: g.clientId,
      personaId: g.personaId,
      intent: g.seed_intent,
      sql: g.seed_sql,
      schemaSnapshot: { goldId: g.id },
      rowCount: 1,
      latencyMs: 0,
    });
    ok += 1;
  }
  console.log(`[seed] done (${ok}/${gold.length})`);
}

async function testAll(gold: GoldEntry[]): Promise<void> {
  let totalIntents = 0;
  let hits = 0;
  for (const g of gold) {
    const expected = scrubPii(g.seed_sql);
    for (const intent of g.test_intents) {
      totalIntents += 1;
      const { embedding } = await embed({
        model: vertex.textEmbeddingModel('gemini-embedding-001'),
        value: intent,
      });
      const matches = await querySqlEmbeddings({
        embedding,
        clientId: g.clientId,
        personaId: g.personaId,
        topK: 1,
      });
      const top = matches[0];
      const hit = top?.sqlText === expected;
      if (hit) hits += 1;
      console.log(
        JSON.stringify({
          severity: 'INFO',
          component: 'eval-recall',
          goldId: g.id,
          intent,
          hit,
          topScore: top?.score ?? null,
        }),
      );
    }
  }
  const hitRate = totalIntents > 0 ? hits / totalIntents : 0;
  const summary = { totalIntents, hits, hitRate };
  console.log(JSON.stringify({ severity: 'INFO', component: 'eval-recall', summary }));
  if (hitRate < HIT_RATE_THRESHOLD) {
    console.error(`[test] hitRate ${hitRate.toFixed(3)} < threshold ${HIT_RATE_THRESHOLD}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { mode } = parseArgs();
  // Only `--mode=seed` writes; the guard sees it as `--apply`.
  assertSeedWriteAllowed({
    databaseId: DATAVIZ_DATABASE_ID,
    argv: mode === 'seed' ? [...process.argv, '--apply'] : process.argv,
    label: 'eval-semantic-recall',
  });
  const gold = loadGold();
  if (gold.length !== 50) {
    console.warn(`[warn] expected 50 gold entries, got ${gold.length}`);
  }
  if (mode === 'seed') await seedAll(gold);
  else await testAll(gold);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
