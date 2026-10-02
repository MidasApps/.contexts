# 0054. Run failures and connector load errors as codes on the read models

- Status: accepted
- Date: 2026-10-02
- Context: UX review batch B7 (U-57, U-59), `docs/plans/2026-10-01-ux-review/consolidated.md`

## Context

A failed or guardrail-stopped workflow run showed only "Falhou" / "Parada por guardrail": the
`WorkflowRun` view had no reason. A connector in "error" showed only the pill, and nothing in the
system ever wrote `status: "error"`: the agent runtime dropped connectors that failed to load
(`Promise.allSettled`) without telling anyone. Both pages left the admin without a reason or a
next step.

The doctrine forbids leaking internals to clients (rule `error-handling`: stack, SQL, raw SDK
messages stay in logs) and decision 0052 names code-defined things through convention message
keys, not keys sent with the data.

## Decision

1. `WorkflowRun` (and `AdminWorkflowRun`, which spreads it) gains an optional, nullable
   `failure: { code, stepId }`. `code` is `STEP_FAILED`, `TRIPWIRE` or `RUN_FAILED`; `stepId` is
   the last step that failed or was stopped. It is derived from the stored Mastra snapshot in
   `toWorkflowRunView`. The error message, the guardrail's reason and any stack are never
   copied: they may name hosts, data or prompts. The client derives the copy from the code
   (`common.runTimeline.failure.<code>`, `settings.workflows.run.failureHint.<code>`); no
   `messageKey` travels in the contract (0052).
2. `Connector` gains an optional, nullable `lastError: { code, at }` with `code` in
   `CONNECTOR_LOAD_ERROR_CODES` (`SECRET_MISSING`, `SPEC_UNAVAILABLE`, `SPEC_INVALID`,
   `SPEC_TOO_LARGE`, `SERVER_NOT_ALLOWED`, `CONNECT_FAILED`, `LOAD_FAILED`). The runtime records
   it through a new optional `ConnectorsPort.recordLoad`, fire and forget, after each tenant
   load: a new code when the outcome changed, `null` when a failing connector loads again,
   nothing when nothing changed (no write per cache refresh). `status` stays `active`:
   `listActive` filters on it, so flipping it to `error` would stop the connector from ever
   loading and healing. The page shows "with error" for an active connector with a
   `lastError`, plus the reason and the time. `at` is a Firestore Timestamp at rest. Recording
   is not an edit: `updatedAt` does not move.
3. `connectorNeedsSecret(connector)` lives in `@core/contracts`, shared by the runtime
   (`SECRET_MISSING`) and the page (after creating a connector that authenticates, the secret
   dialog opens at once).

## Consequences

- Both fields are additive and optional (rule `schemas`): older documents and runs parse as
  before; catalog and OpenAPI regenerated.
- The legacy `status: "error"` value stays in the enum; nothing writes it.
- A run's trace link and "run again with the same input" are not in this decision: traces carry
  no `runId` and the run view carries no input (follow-ups in
  `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`). "Run again" preselects the workflow.

## Alternatives

- Send the error message (sanitized): rejected; sanitizing free text from SDKs and processors
  is unreliable and the codes cover what the admin can act on.
- Flip `status` to `error`: rejected (see 2).
- A separate connector-health collection: more moving parts for one field read with the list.
