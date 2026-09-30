# 0028. Agent evals with own scorers and a CI gate

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/evals`, `app/packages/agents/src/scorers`, CI (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-18 (§13); framework ADR 0004 exception E4

## Context

The SP3 gate requires a minimal versioned eval set per core agent passing in CI (umbrella §13). `@mastra/evals` declares peer `vitest <5` while the workspace runs Vitest 5.0.2 (framework ADR 0004, E4), so its prebuilt scorers and matchers cannot be installed. `stacks/ai/mastra-sdk.md` warns against treating eval scores as booleans.

## Decision

1. Scorers are written with `createScorer` from `@mastra/core/evals` and registered in `new Mastra({ scorers })`: deterministic `tool-routing`, `citations-grounded`, `tenant-leak`, `format-compliance`; LLM `faithfulness-judge` (judge role) in real mode only.
2. Datasets are versioned JSONL files (`evals/datasets/<agent>.v<N>.jsonl`, 10–30 cases each: input, expected tool, expected citations, ground truth), the source of truth; `pnpm evals:seed` copies them into `mastra.datasets`.
3. Runner: Vitest 5 project `evals` (`*.eval.test.ts`) calling `runEvals` with `target: mastra.getAgent(id)`. The gate compares the mean score per scorer with `evals/baselines/<agent>.json` (`minimum`, `tolerance`).
4. `pnpm evals` runs in CI with `AI_MODE=fake`; `pnpm evals:real` runs the same sets with real models plus the judge (manual or nightly, skipped without keys). Results go to Mastra experiments and a JSON report in `app/.evals/`.

## Consequences

- The CI gate is deterministic; real-model drift shows up in the nightly run, not in PRs.
- When `@mastra/evals` accepts Vitest 5, its scorers can be added next to the own ones without changing datasets or baselines.

## Alternatives rejected

- **Downgrade Vitest to 4 for `@mastra/evals`.** Breaks the workspace baseline (ADR 0004) for one package.
- **Evals as plain unit tests with exact output assertions.** Brittle with real models and hides the score distribution.
- **Real-model evals in every PR.** Cost, secrets in CI and flaky gates.
