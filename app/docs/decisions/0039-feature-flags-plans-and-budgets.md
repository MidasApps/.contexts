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
- **2026-10-01 — plans, budgets and agent settings as built (SP5 Task 10).**
  - **Stores.** Plans in Firestore `plans` (automatic ids). An organization's plan and the staff
    budget override live in `organization-plans/{tenantId}`, not on the SP1 organization document;
    staff status changes (`active|suspended`) write the SP1 document through a narrow adapter.
    Agent settings live in `agent-settings/{tenantId}` (the contract's document id), with the
    organization's own lower cap as a storage-only `selfCap`. Without a document the defaults
    apply: core subagents, web off, PII `redact` (conservative while `compliance.md` is a template).
  - **Caps.** `resolveTenantCaps`: staff override → plan limits → platform default (USD 50, 20 M
    tokens), then the tenant's own cap lowers each value, never raises it (`PATCH
    /v1/agent-settings` with a higher cap answers 400 `VALIDATION_FAILED`, issue `ABOVE_PLAN`).
  - **Materialized for the guard.** Every write that changes an input (plan assignment, plan
    limits for every organization on the plan, override, self-cap) upserts the resolved caps into
    `usage.tenant_budgets` (role `usage_runtime`) and mirrors them in `agent-settings.budget`. The
    runtime's `checkTenantBudget` is unchanged and never reads Firestore. A failure between the
    Firestore write and the Postgres upsert answers 500 and leaves the old caps in force until the
    next write.
  - **Runtime.** The Mastra `SettingsPort` is bound to these settings, so the PII detector mode and
    the enabled agents are the tenant's (SP3 Task 17 concern 4; the fail-closed stand-in is gone).
  - **Audit.** `PLAN_CREATED`, `PLAN_UPDATED`, `ORGANIZATION_UPDATED` (plan, status),
    `TENANT_BUDGET_UPDATED` and staff `AGENT_SETTINGS_UPDATED` on the platform log, with
    `targetTenantId` for an organization; a tenant's own `AGENT_SETTINGS_UPDATED` on its log.
  - **Overview.** `/v1/admin/overview` computes active organizations and the cost month to date
    (one ledger read per organization). Active users, tripwire and approval rates answer 0 and the
    eval status `unknown` until span aggregates and an eval run history exist.
- **2026-10-01 — runtime meaning of two flags (backend fixes).**
  - `workflows.schedules` off holds every schedule fire, tenant and platform (decision 0037 A2). It no
    longer means "stop creating schedules": creation keeps working and the new rows wait.
  - `ai.memory.observational` is a **boot-time** flag. Memory is built once per process from
    `AI_MEMORY_OBSERVATIONAL`, which also seeds the flag's environment default; a value stored from
    `/admin` is shown but does not change a running runtime, and a restart still reads the env var.
    Reading it per request would mean building both memories and choosing one per call, which
    Mastra's agent memory does not offer cheaply. Follow-up: read the stored value once at boot.
