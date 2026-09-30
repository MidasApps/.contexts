# 0039. Feature flags, plans and budgets

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/services/src/services/{flags,platform,usage}`, `app/packages/agents/src/runtime` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-04 (§5) and D5-05 (§6); `@.contexts/engineering/rules/governance.md` ("Feature flags", "Custo")
- **Relates to:** decision 0026 (usage ledger and budget guard)

## Context

Governance requires every flag to have an owner, a reason and an expiry, and it requires a
kill-switch for AI features. Tenant budgets exist since SP3 (`usage.tenant_budgets`, with default
plan values), but nothing defines plans.

## Decision

**D5-04: flags.**

- `FlagsPort` has two adapters: Firebase Remote Config server templates outside local, and the
  Firestore `feature-flags` collection in local (Remote Config has no emulator).
- A code registry (`flags/flag-registry.ts`) declares each flag: `key`, `owner`, `reason`,
  `createdAt`, `expiresAt`, `kind: kill-switch|rollout|ops` and `default`. Values are set per
  environment, with optional tenant overrides. Expired flags show a warning in `/admin`.
- Core flags:
  - `ai.kill-switch`: every agent and chat run answers `503 FEATURE_DISABLED`;
  - `ai.web-tools`, `chat.voice.realtime`, `ai.memory.observational`, `workflows.schedules`.

  Reads are cached for 30 s.

**D5-05: plans and budgets.**

- Plans live in Firestore `plans` (`name`, `limits { monthlyMicroUsd, monthlyTokens,
  maxConnectors, features[] }`), and staff manage them (`platform.plan.manage`).
- A tenant's budget comes from its plan. Staff may override it, audited with `targetTenantId`. A
  tenant may only set a lower cap for itself.
- Alerts fire at 80 % and 100 %, once per month per tenant.

## Consequences

- AI can be switched off per environment or per tenant without a deploy.
- Budget checks keep calling `checkTenantBudget`; only the source of the limits changes.

## Alternatives rejected

- **Env vars as flags.** They need a deploy and have no owner or expiry.
- **Plans in Postgres.** The admin console and Rules already work on Firestore platform data.
