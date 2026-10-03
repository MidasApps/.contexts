# 0060. Usage breakdowns per day, agent and user; the own cap read back

- **Status:** accepted
- **Date:** 2026-10-03
- **Scope:** `app/packages/contracts` (`usage.UsageSummary`, `agents.AgentSettings`), `app/packages/services` (`usage`, `agents`, `platform` agent settings store), `app/packages/client` (`/settings/usage`, `set-usage-cap`, `entities/member`), `app/packages/i18n` (`settings.usage`) (local decision; the framework is unchanged)
- **Refines:** decision 0026 (usage ledger), decision 0039 (budget caps and own cap), decision 0045 (tenant settings pages), decision 0056 (remove confirmation)
- **Source:** follow-ups 63 and 99

## Context

SP5 spec §7 asks the tenant usage page for usage per model, agent and user. `GET /v1/usage` had
month totals and a per-model breakdown only (follow-up 63). On the same page, "Remover limite
próprio" was always offered, because `GET /v1/agent-settings` returned only the caps in force
(`budget`): the organization's own lower cap (`selfCap`) was stored but never read back, so the page
could not tell an own cap from the plan's (follow-up 99).

## Decision

1. **`usage.UsageSummary` gains `byDay`, `byAgent` and `byUser`** (additive, same version), each
   row `{ <key>, totals }` with the existing totals shape. They are read from the same month of
   `usage.llm_calls` as the totals, in one read-only tenant transaction under row level security
   (`UsageRepository.getMonthBreakdowns`). Days are UTC days with calls, oldest first; agents and
   users are ordered by cost, largest first. `byUser.userId` is `null` for calls without a user
   (platform jobs), shown as "Processos da plataforma".
2. **The summary is now personal data** (`pii: "personal"`), because `byUser.userId` is a uid, as in
   `usage.LlmCall`. `catalog.ai.json` redacts its example accordingly.
3. **`agents.AgentSettings` gains `ownBudget: BudgetCaps | null`** (additive): the organization's own
   cap as it set it, `null` when it set none. It is a read model field: Firestore keeps storing
   `selfCap`, and the services map it to `ownBudget` on every read and write answer
   (`agentSettingsOf`); the stored fields are `AgentSettingsFields` (the contract without
   `ownBudget`).
4. **The usage page says which cap applies** — none of its own (the plan's), its own, or its own
   where the plan is not lower — and offers "Remover limite próprio" only when `ownBudget` is set.
   Since the caps in force are the lower of plan and own cap, an own value equal to the cap in
   force is in force.
5. **Names on the page:** agents use their catalog labels (decision 0052); users show the member's
   name when the viewer holds `core.member.read`, else the uid. The member-name hook moves from
   the workflows view to `entities/member` (`useMemberNames`) so both views share it.

## Consequences

- Clients parse responses strictly, so every fixture of these two contracts carries the new fields.
- The breakdowns add two grouped reads per summary on `llm_calls_tenant_occurred_idx`; a month of
  one tenant stays small enough for this to be cheap.
- "Plan" in the copy also covers a staff override, as elsewhere on the page.

## Alternatives rejected

- **Reading the daily rollups (`usage.daily_rollups`) for the breakdowns.** They have no user and
  lag the ledger; the totals on the same page come from the ledger.
- **A `budgetSource` field instead of `ownBudget`.** It says where the caps come from but not the
  own values the admin set, which the page needs to show and the follow-up asked for.
- **Storing `ownBudget` in the settings document.** It would duplicate `selfCap`.
