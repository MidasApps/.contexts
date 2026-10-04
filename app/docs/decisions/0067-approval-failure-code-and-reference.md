# 0067. A failed approval request keeps its failure code and reference

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/contracts` (`access/approval-request.schema.ts`), `app/packages/services`
  (`access`: `approve-request.ts`, `approval-sweeps.ts`, the approval request repositories),
  `app/packages/client` (`entities/approval-request`), `app/packages/i18n` (local decision; the
  framework is unchanged)
- **Refines:** decision 0030 A3 (interrupted approvals), decision 0056 §4 (a failed execution is
  said on the request), decisions 0052 and 0054 (codes on read models, no message keys on the
  wire); follow-ups #100, #20 and #46

## Context

An approval request that ends `failed` said only that the action did not run. The handler's
code (`approve-request.ts`) and the sweep's `EXECUTION_INTERRUPTED` (decision 0030 A3) went
only to the `APPROVAL_FAILED` audit entry, which approvers and requesters do not read. So
nobody could tell why the action failed or quote it to support. Row #100 asked for
`failure { code, messageKey }`. Decisions 0052 and 0054 keep message keys off the wire.

Most of rows #20 and #46 had already landed:

- The sweep job, its index and its tests landed in `5cf5bc3e` (`approval-expiry-sweep`, every
  15 min).
- The staff cancel of a suspended run cancels its request through `cancelStoredRun`. That
  landed in `8a47962e` (follow-up 82), and `operations-console.test.ts` pins it.

## Decision

1. `ApprovalRequest` gains an optional `failure: { code, requestId }`. Only a `failed`
   request has it.
   - `code` must match `ApprovalFailureCodeSchema` (SCREAMING_SNAKE, at most 64 characters).
     It is the handler error's own `code` when that matches, otherwise
     `APPROVAL_HANDLER_FAILED`. The core also writes `UNKNOWN_APPROVAL_ACTION` and
     `EXECUTION_INTERRUPTED`.
   - `requestId` is the request id that logged the error. For the sweep, it is the sweep
     run's id.
   - The error message and the stack are never stored (rule `error-handling`). No message key
     is sent.
2. The approve path writes `failure` in the same transaction that records `failed` and its
   audit entry. The interrupted-execution sweep does the same with `EXECUTION_INTERRUPTED`.
   `ApprovalStatusChange` gains the optional `failure`, and both repositories write it.
3. The client keeps the existing "approved but not run" line. Under it, it adds two lines:
   - the reason, taken from the code (`common.approvals.item.failureReason.<code>`), with
     copy for `EXECUTION_INTERRUPTED` and `UNKNOWN_APPROVAL_ACTION` and a generic reason for
     any other code (module codes are open-ended);
   - `Referência: {requestId} ({code})`, in monospace.

## Consequences

- The field is additive and optional (rule `schemas`). Older documents parse as before.
  The catalog and OpenAPI were regenerated.
- A module that wants its own failure copy throws an error with a stable `code`. The client
  shows the generic reason and quotes that code.
- Row #46 keeps only the staff SSE run stream open.

## Alternatives

- **`messageKey` on the wire (as row #100 proposed).** Rejected: decision 0052 derives copy
  from codes on the client.
- **Read the reason from the audit log.** Rejected: the audit log needs `core.audit-log.read` (owners and admins),
  which requesters do not have, and the request page would need a second read.
