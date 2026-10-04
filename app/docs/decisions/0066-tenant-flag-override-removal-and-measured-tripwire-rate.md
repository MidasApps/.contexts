# 0066. A tenant removes its own flag override; the overview measures the tripwire rate

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/contracts` (`platform/flag-endpoints.ts`), `app/packages/services` (`flags`, `usage`, `platform`), `app/packages/agents` (`observability/usage-ledger-exporter.ts`, `runtime/runtime-ports.ts`), `app/apps/mastra` (`runtime/usage-port-binding.ts`), `app/apps/web` (`src/app/v1/flags/[flagKey]/route.ts`), `app/packages/client` (`features/tenant-set-flag`, `views/settings-flags`), `app/packages/i18n` (`settings.flags`), Postgres migrations 0012 and 0013 (local decision; the framework is unchanged)
- **Refines:** decisions 0026 (usage ledger), 0039 (feature flags, overview), 0044 (staff removal of an override), 0049 (unmeasured numbers); follow-ups #56 and #57

## Context

**Flag override (follow-up #56).** Staff can remove an organization's override of a flag
(`DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}`, decision 0044), but the
organization itself can only set a value (`PUT /v1/flags/{flagKey}`). An organization that switched
a flag off could only switch it back on with an override `true`. It could not return to following
the environment value.

**Tripwire rate (follow-up #57).** The `/admin` overview's tripwire rate was always 0, listed in
`unmeasured` (decision 0049). A guardrail stop aborts the run, but nothing persisted it: there was
no audit action and no ledger column. There was no count of agent runs to divide by either. The
usage ledger already sees every span unsampled (`UsageLedgerExporter`, decision 0026). Mastra
1.71.0 ends the `AGENT_RUN` span of a stopped run with `attributes.tripwireAbort.processorId`.
A probe confirmed it for an input processor: `stream` with the `entry` guardrail profile and an
injected prompt. The detectors' own agents end internal `AGENT_RUN` spans.

## Decision

### Flag override (follow-up #56)

1. **Endpoint.** `DELETE /v1/flags/{flagKey}?organizationId=` (`flags.clearTenantOverride`) needs
   the same permission as the write: `core.flag.write` at the organization (`requireTenant`). It
   answers the flag without the override (200, `FeatureFlag`). It is idempotent: removing an
   absent override answers the flag again and writes no audit entry.
2. **Who removes what.** `ClearFlagOverrideCommand` gains `by: "staff" | "tenant"`, as
   `SetFlagValueCommand` has. A tenant may remove its override only on a tenant-overridable flag.
   Otherwise the answer is 403 `FORBIDDEN` (`FLAG_NOT_OVERRIDABLE`), so an organization never
   removes what staff set on a flag it cannot change. An unknown flag is 404.
3. **Audit.** A removal is audited like a write (`FEATURE_FLAG_UPDATED`,
   `changes: ["tenantOverride"]`). Staff removals go to the platform log with `targetTenantId`, as
   before. A tenant removal goes to the organization's log.
4. **`/settings/flags`.** A row with an override shows "Seguir a plataforma" next to the existing
   action. It is shown only to a member with `core.flag.write`, and only while online. It opens a
   confirmation dialog (`TenantClearFlagOverrideDialog`) that says the feature will take the
   platform value, on or off. The dialog shows the pending state, keeps a failure in the dialog
   with the request reference, and refreshes the list on success. This is the same pattern as
   `TenantSetFlagDialog`. "Voltar a usar" still writes an override `true`.

### Tripwire rate (follow-up #57): persisted, not removed

5. **Store.** New ledger table `usage.agent_runs` (migration 0012, generated). It has `id`,
   `request_id`, `trace_id`, `tenant_id`, `user_id`, `agent_id` and `tripwire_processor_id`
   (null when no guardrail stopped the run), plus `occurred_at` and the timestamps. It has the
   same row level security as `llm_calls` and the index `(tenant_id, occurred_at)`. Migration 0013
   adds `FORCE` and grants `usage_runtime` `SELECT, INSERT` only (append-only). It is not exported
   to BigQuery and is not a published contract. The `usage` context validates rows once
   (`AgentRunSchema`, `recordAgentRuns`).
6. **Writer.** The ledger exporter also handles `AGENT_RUN` spans. Every ended, **non-internal**
   agent run with a tenant in its request context becomes a row. Internal runs are the
   detectors' own agents. It covers the supervisor, delegated agents and workflow agent steps. It
   batches like the model calls (2 s or 50 rows, bounded retry buffer). It reuses the start
   context of durable agents. `UsagePort` gains `recordAgentRuns`.
7. **Rate.** `tripwireRate` = agent runs stopped by a guardrail over all agent runs of the last 7
   days, over active organizations. There is one count per organization under its row level
   security (`countAgentRuns`), and the rate is 0 without runs. `unmeasured` is now `[]`. The
   contract is unchanged: the enum keeps `tripwireRate` for older answers, and the console
   already shows the value when it is not listed.

## Consequences

- An organization can now undo its own change completely; the list then shows "Sem alteração" and
  the platform value again.
- `ClearFlagOverride` callers must say who acts (`by`); the staff route passes `"staff"`.
- One more Postgres row per agent run. The overview reads one count per active organization, as
  for active users.
- The rate counts every non-internal agent run. A delegated agent's run counts on its own, so a
  turn with two delegations is three runs. A stop of a delegated agent counts once, on that run.
- Rows start at deploy. The first 7 days after deploying 0012/0013 show a rate over a partial
  window. Output tripwires count only if Mastra sets `tripwireAbort` on the run span, as it does
  for input processors today. Workflow runs that end `tripwire` are not agent runs and are not
  counted.

## Alternatives rejected

- **Removing the metric from the overview.** The ledger exporter already received the spans that
  carry the stop, so persisting cost one table, one exporter branch and one count. Decision 0049
  had also rejected hiding it.
- **Audit entries for each stop.** The audit log has no runs to divide by. The runtime's
  `AuditPort` needs an actor principal that a span does not carry.
- **Zero-token rows in `usage.llm_calls`.** Pollutes the cost and model breakdowns (decision
  0060). A budget stop also never reaches a model, so there is no call to mark.
- **Counting Mastra's stored traces.** They are sampled to 20 % outside `local`/`dev`
  (decision 0026).
- **`PUT /v1/flags/{flagKey}` with `value: null`.** The body would mix two operations and break
  the existing `TenantFlagValueInput` contract.
- **Making "Voltar a usar" remove the override.** This would change what an existing action does
  without saying so. The follow-up asks for a removal, so the removal is a separate, named action.
