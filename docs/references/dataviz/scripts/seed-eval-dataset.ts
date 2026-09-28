#!/usr/bin/env tsx
/**
 * Stub: gera `full-180.json` a partir do seed `smoke-30.json` aplicando
 * variacoes via Vertex AI (Sprint 3.D, Task 9 refactor).
 *
 * NAO E EXECUTADO em CI/test. O scaffold atual em `full-180.json` e gerado
 * por replicacao 6x do `smoke-30.json` para validacao do runner; a curadoria
 * real (150 variacoes via LLM, revisao por 2 SMEs, jitter de numeros/prazos)
 * sera feita por este script quando promovido fora do `Bulk D2`.
 *
 * Uso (futuro):
 *   pnpm tsx scripts/seed-eval-dataset.ts \
 *     --seed src/features/evals/datasets/smoke-30.json \
 *     --out src/features/evals/datasets/full-180.json \
 *     --target 180
 *
 * Pipeline planejado:
 *   1. Carregar smoke-30 como seed.
 *   2. Para cada fixture, gerar 5 variacoes via Vertex (`gemini-2.5-pro`):
 *      - jitter de numeros (LTV, prazos, ticket).
 *      - jitter de termos (sinonimos: "atraso" / "inadimplencia" / "delinquency").
 *      - troca de persona dentro do mesmo grupo (CFO -> Controller, Diretor -> Gestor).
 *   3. Validar cada variacao com `BriefingFixtureSchema`.
 *   4. Marcar `expectedRegulatory` quando o briefing toca CMN_2682/CVM_60/etc.
 *   5. Persistir em `full-180.json`.
 *
 * Riscos:
 *   - Vies do LLM ao gerar variacoes: mitigado por revisao cruzada de 2 SMEs.
 *   - Drift semantico: jitter limitado a +-20% em numeros e thesaurus controlado.
 */

export {};

async function main() {
  console.log('[seed-eval-dataset] STUB - nao executar em CI.');
  console.log('[seed-eval-dataset] Scaffolding atual: full-180.json e replica 6x de smoke-30.json.');
  console.log('[seed-eval-dataset] Para curadoria real, ver doc no topo do arquivo.');
}

main().catch((err) => {
  console.error('[seed-eval-dataset] FAILED:', err);
  process.exit(2);
});
