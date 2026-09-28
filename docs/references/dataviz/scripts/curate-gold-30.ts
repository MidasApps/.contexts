#!/usr/bin/env tsx
/**
 * Stub: CLI interativo para curadoria humana de `gold-30.json`
 * (Sprint 3.D, Task 10).
 *
 * NAO E EXECUTADO em CI/test. Quando promovido, este script ira:
 *   1. Carregar `gold-30.json`.
 *   2. Para cada fixture sem `goldScores` ou com flag `needsReview`,
 *      apresentar ao SME (terminal):
 *        - briefing
 *        - agent output (mock ou real, conforme `--mode`)
 *        - prompt para score 0..1 + rationale por scorer.
 *   3. Persistir em JSON e abrir prompt para commit.
 *
 * Uso (futuro):
 *   pnpm tsx scripts/curate-gold-30.ts --file gold-30.json --mode mock
 *
 * Revisao cruzada: 2 SMEs assinam por fixture (campo `reviewedBy`).
 */

export {};

async function main() {
  console.log('[curate-gold-30] STUB - interactive curation TODO.');
  console.log('[curate-gold-30] gold-30.json atual e seed automatica para validacao do runner.');
}

main().catch((err) => {
  console.error('[curate-gold-30] FAILED:', err);
  process.exit(2);
});
