# 0038. Versioned prompt store with eval-gated activation

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/services/src/services/agents`, `app/packages/agents/src/agents/load-instructions.ts`, Postgres schema `agents` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-03 (§4); `@.contexts/engineering/rules/governance.md` ("Governança de IA generativa")

## Context

Governance allows prompts that change at runtime only through an ADR. It requires a version per
write, the author, a timestamp, rollback, and an evaluation before a production change.
`@mastra/editor` (stored agents) is not adopted (SP3 §14).

## Decision

**D5-03.**

- **Store.** Our own append-only Postgres store:
  - `agents.prompt_versions`: uuidv7, agent, scope `platform|tenant`, the tenant id for tenant
    scope, version, body, SHA-256, author, note, eval experiment and verdict;
  - `agents.prompt_activations`: the latest row per agent, scope and tenant is the active one.

  There is no update path: every write is a new version, and a rollback is a new activation of
  an older version. Row level security isolates tenant rows.
- **Scopes.** Platform scope holds the full instructions (staff, `platform.prompt.manage`).
  Tenant scope is an **addendum** appended in a delimited section; a tenant never replaces
  platform text.
- **Eval gate.** Activation requires a passing experiment of the candidate on the agent's
  dataset, else `409 EVAL_REQUIRED`. The experiment runs through `startExperiment` with the
  request-context override `promptVersionId`, which is allowed only for runs that
  `run-prompt-eval` starts. Staff may force an activation with a reason, audited
  `PROMPT_ACTIVATION_FORCED`.
- **Loading.** `load-instructions.ts` resolves the active platform version and falls back to the
  code seed. It appends the tenant addendum and caches the result for 60 s per agent and tenant.
  An idempotent script imports the code seeds as version 1.

## Consequences

- Prompt changes are audited and reversible without a deploy.
- A failing eval blocks activation unless staff record why.

## Alternatives rejected

- **`@mastra/editor` stored agents.** They replace whole agents, and have no tenant addendum and
  no eval gate.
- **Prompts only in code.** Every wording change needs a deploy, and tenants cannot add context.
