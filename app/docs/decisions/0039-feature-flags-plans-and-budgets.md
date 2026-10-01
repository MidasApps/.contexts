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

## Amendments

- **2026-10-01 — flags as built (SP5 Task 8).**
  - **Stores.** Environment values: Firestore `feature-flags/{flagKey}` in local; outside local one
    boolean parameter per flag (`core_flag_<key>`) in the project's Remote Config template.
    firebase-admin 14.5 reads server templates but cannot publish them, so `/v1/admin/flags`
    publishes the project template (ETag, one retry). The parameters hold booleans only. Tenant
    overrides never go to Remote Config: they live in Firestore `feature-flag-overrides/{tenantId}`
    (a `values` map) in every environment. Both document ids are deterministic (the registry key,
    the tenant id), like `agent-settings/{tenantId}`: an ADR 0005 exception for code-keyed
    configuration. The catch-all Security Rule denies clients both collections.
  - **Resolution.** Tenant override → stored environment value → boot default (env seeds, decision
    0034 amendment) → registry default. A kill-switch is on when the environment **or** the tenant
    turns it on, so an override never lifts a platform kill.
  - **Writes.** Staff (`platform.flag.manage`, MFA) set any flag for the environment or a tenant,
    audited `FEATURE_FLAG_UPDATED` on the platform log with `targetTenantId`. A tenant's admins
    (`core.flag.write`) may override only flags marked `tenantOverridable` (`chat.voice`,
    `chat.voice.realtime`), and may not enable one the environment disables (400
    `VALIDATION_FAILED`, issue `ENVIRONMENT_DISABLED`); audited on the tenant log.
  - **Runtime.** `FlagsPort.getValues({ tenantId })`, wrapped by `createFlagReader` (30 s per
    tenant; a failed refresh keeps the last values; nothing cached → the caller's fallback). The
    context middleware answers 503 `FEATURE_DISABLED` for agent, MCP, chat and voice paths when
    `ai.kill-switch` is on, failing closed. `ai.web-tools` off hides web tools and the web subagent
    whatever the tenant opt-in. `ai.memory.observational` and `workflows.schedules` are registered
    but still read at boot (`AI_MEMORY_OBSERVATIONAL`) or not read yet; memory is built once per
    process.
  - **Staff guard.** Every `/v1/admin/*` handler calls `requireStaff`: a `platform.*` permission at
    the platform node. Non-staff and support staff without the permission get 403 `FORBIDDEN`,
    staff without MFA 403 `MFA_REQUIRED`, and an impersonated token is never staff. Each refusal is
    audited `PLATFORM_ACCESS_DENIED`. The API answers 403, not 404: the platform node is not a
    secret, and the `/admin` layout still answers 404 to non-staff (decision 0041).
