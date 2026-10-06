# SP3 Task 28 — Observational Memory comparison

**Outcome: not run with real models (no provider keys). Observational Memory stays off
(`AI_MEMORY_OBSERVATIONAL=false`).** No quality number exists yet; the fake run below
proves the harness only.

## Why it was not run

Every provider key in `app/.env.local` is empty (`GOOGLE_GENERATIVE_AI_API_KEY`,
`GOOGLE_VERTEX_PROJECT`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; checked by length, values
never printed), and none is set in the process env. `pnpm -F @core/agents evals:real`
skips cleanly in that case (6 files skipped, the comparison among them).

## Harness

| Piece | Path |
|---|---|
| Dataset (10 generic multi-turn cases) | `app/packages/agents/evals/datasets/memory.v1.jsonl` |
| Runner, scoring, decision rule | `app/packages/agents/src/evals/memory-comparison.ts` |
| Token/cost meter over every text model call | `app/packages/agents/src/evals/metered-models.ts` |
| In-memory `MastraVector` (the CI eval job has no Postgres) | `app/packages/agents/src/evals/in-memory-vector.ts` |
| Eval test (fake in `pnpm evals`, real in `evals:real`) | `app/packages/agents/src/evals/memory-comparison.real.eval.test.ts` |
| Unit tests | `memory-comparison.test.ts`, `in-memory-vector.test.ts` |

- Each case states facts in one conversation (thread `…-setup`) and asks for them in a new
  conversation (thread `…-probe`) of the same resource `tenantId:uid`, so only cross-thread
  memory can answer.
- **Config A** = `createMemory` as shipped (history 20, semantic recall topK 4 resource
  scope, working memory). **Config B** = the same call with `AI_MEMORY_OBSERVATIONAL=true`,
  i.e. exactly what the flag adds (OM on the `fast` role, resource scope, on top of A).
- Score = share of `expectedTerms` in the probe answer (deterministic). Tokens and cost cover
  every text model call of a config (chat, title generation, OM observer/reflector), priced
  with `model-prices.ts` (verified 2026-09-29). Embedding calls are not metered; both configs
  embed the same messages.
- Decision rule (`recommendObservational`): enable OM by default only on a **real** run where
  B's mean score ≥ A's and B's cost ≤ 1.2 × A's; a fake run never decides.
- Report: `app/.evals/memory-comparison.json` (fake) / `memory-comparison.real.json` (real).

## Fake run (harness proof, not quality)

`cd app/packages/agents && npx vitest run --project evals src/evals/memory-comparison.real.eval.test.ts` → 1 passed (35 s).

| Config | Calls (chat / fast) | Input tokens | Output tokens | Recall reached the probe prompt |
|---|---|---|---|---|
| A-semantic-recall | 49 (30 / 19) | 19 209 | 1 295 | 10 / 10 |
| B-observational | 49 (30 / 19) | 19 799 | 1 295 | 10 / 10 |

Scores are 0 in both configs because the scripted fake model echoes the question; that is
expected and says nothing about quality. The fake prices below are fake-model tokens priced as
the configured models and are not a cost estimate either. B made no extra model call: the
Observer never ran (see the precondition below); the +590 input tokens are OM's context
instructions.

## Precondition for the real run

OM observes only after a thread (resource scope: all unobserved messages of the resource)
crosses `observation.messageTokens`, **30 000 tokens by default** (`@mastra/memory` 1.32.1).
`createMemory` keeps that default. memory.v1's conversations are far below it, so a real run on
memory.v1 alone would make B ≡ A plus OM instructions, and the comparison would be vacuous.
Before a real run decides the default, add a `memory.v2` with long setup sessions (over 30 000
tokens per resource), or record why a lower `messageTokens` is the value to ship and set it in
`createMemory` for both the eval and the app.

## How to run it with keys

```bash
cd app/packages/agents
GOOGLE_GENERATIVE_AI_API_KEY=… pnpm exec vitest run --project evals-real memory-comparison   # this file only; `pnpm evals:real` runs every real set + judge
# then apply the rule; if it says enable, flip the default of AI_MEMORY_OBSERVATIONAL and amend decision 0029
```

Decision 0029 has an amendment recording this outcome. Follow-up #37 tracks the real run.
