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

## Amendments

- **2026-10-01 — the store as built (SP5 Task 9).**
  - **Tables.** Migration 0010 creates schema `agents` with `prompt_versions` (unique agent, scope,
    tenant and version with `NULLS NOT DISTINCT`; scope/tenant, SHA-256 and verdict CHECKs) and
    `prompt_activations` (FK to the version, `ON DELETE RESTRICT`, indexed; a forced activation needs
    a reason). Migration 0011 forces row level security and adds role `prompts_runtime`: SELECT and
    INSERT on both tables and UPDATE of the eval columns only, so bodies and activations can never
    change or disappear. A policy shows platform rows to everyone and a tenant's rows to that tenant;
    platform-only reads run under the scope `~platform`, which no organization id can equal.
  - **Eval run.** `run-prompt-eval` calls the Mastra route `POST /prompt-evals/:versionId` (no user
    Bearer, behind Cloud Run IAM like the settle route of decision 0036; `/v1` already authorized the
    caller for the prompt line). The route re-reads the version under the given tenant scope, runs
    the agent's committed eval set (decision 0028) in the isolated eval harness with the candidate
    injected as the harness's active prompt (a tenant addendum runs on top of the active platform
    prompt), gates the means against the agent's baseline and records the verdict and run id on the
    version. The verdict never comes from the web side.
  - **No request-context override in production.** Instead of a `promptVersionId` key that the live
    runtime would honor, the candidate exists only inside the harness, so no caller of the
    production runtime can make an agent run an unactivated prompt. `experimentId` is the harness
    run id, not a Mastra dataset experiment; agents without an eval set (`web`) answer 422
    `EVAL_DATASET_MISSING` and can only be force-activated by staff. In fake mode the models ignore
    instructions, so a verdict there proves the wiring only.
  - **Loading.** Every core agent's `instructions` is dynamic: the active platform body (else the
    code seed) plus the tenant addendum in an `<organization-addendum>` section after a sentence
    stating it never overrides the rules above (a closing tag inside the addendum is neutralized).
    Cached 60 s per agent and tenant; a store failure serves the cache, else the seed without an
    addendum.
  - **Writes and audit.** Staff (`platform.prompt.manage`) write platform versions; an
    organization's admins (`core.prompt.write`) write its addendum; tenants can never force.
    Audited `PROMPT_VERSION_CREATED` (with the body hash as fingerprint, never the body),
    `PROMPT_EVALUATED`, `PROMPT_ACTIVATED` and `PROMPT_ACTIVATION_FORCED` (with the reason).
  - **Seeds.** `pnpm seed:local` imports each code seed as platform version 1 and activates it,
    marked forced with the reason that the CI eval gate covers it; a rerun skips agents that
    already have a version.
