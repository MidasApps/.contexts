# 0036. Workflow human-in-the-loop on SP1 approval requests

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/agents/src/workflows`, `app/packages/services/src/services/{access,workflows}`, `app/apps/functions/src/approvals`, `app/apps/mastra`, `app/apps/web/src/server` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-01 (§3.3); umbrella §16.2 (four eyes)
- **Relates to:** decisions 0025 (agent-command approvals), 0030 A3 (interrupted approvals)

## Context

Workflows need a human decision in the middle of a run, with the same four-eyes rules, audit
and inbox as agent commands. SP1 already owns approval requests (`approval-requests`,
`ApprovalActionHandler` registry, approve/reject endpoints, at-most-once execution). Mastra
workflows suspend and resume; on Postgres a resume atomically claims the run
(`WORKFLOW_RESUME_ALREADY_CLAIMED` for a second caller).

## Decision

**D5-01.** One inbox, SP1 data; Mastra holds only the run state.

1. **Step `requestHumanApproval`** (`@core/agents`, reusable by modules): creates an SP1
   approval request with action `{ kind: 'workflow-resume', input: { workflowId, runId, stepId },
   summary }`, the workflow's permission (one with `requiresApproval`) and the context node, as
   the principal of the run's request context, then `suspend({ approvalRequestId })`.
   `resumeSchema = { decision: 'approved'|'rejected'|'expired'|'cancelled', decidedBy?, reason? }`.
2. **The resume data is never trusted.** On resume the step re-reads the SP1 request (system
   read `getApprovalRequest`) and requires that its effective status matches the decision
   (`approved` needs `approved` or `executed`; `rejected`, `expired` and `cancelled` need the same
   status) and that the action names this workflow, run and step. On a mismatch it suspends
   again. Mastra's built-in `/api/workflows/**` routes are reachable by any authenticated caller
   of the private runtime, so a forged `resume` must never release an action.
3. **Settle route instead of a caller resume.** Nobody holds a user Bearer when a decision is
   applied: the SP1 handler context has the approver but no token, and the Functions trigger has
   no user. Mastra therefore serves `POST /workflow-approvals/:approvalRequestId/settle` (a custom
   route outside the API prefix). Its only input is the id. It reads the request from SP1,
   derives the decision and `decidedBy` from the stored status, and resumes the run named by the
   stored action **in process with an empty request context**. Mastra then restores the
   snapshot's context, so the remaining steps run as the **requester**. A run that is not
   suspended, or that another caller already claimed, answers `200 { settled: false }`
   (idempotent).
   - **Auth.** The route is `requiresAuth: false`; outside local, Cloud Run IAM protects it (the
     gateway's `X-Serverless-Authorization`, as for every Mastra call). Accepted threat: a caller
     inside the trust boundary can only force an early settle of a request SP1 already decided.
     It cannot choose the decision.
   - The settler adapter (`createMastraWorkflowApprovalSettler`, `@core/services` workflows
     context, beside the gateway) sends only `X-Request-Id` and the serverless token, and maps
     errors by status like the gateway.
   - The route awaits the resume, so the `/v1` approve call returns when the run reaches its next
     suspension or its end. Long post-approval work belongs in a step started asynchronously.
4. **Approve.** SP1 runs the `workflow-resume` handler at most once. The handler checks the
   action against the approved request and calls the settle route. Placement follows decision
   0025's amendment: the handler lives in `@core/services` (the web cannot import
   `@core/agents`). `apps/web` (where approvals are decided) and `apps/mastra` (where they are
   requested) both register it; a second registration is a no-op.
5. **Reject, expire, cancel.** The Functions trigger `onApprovalRequestSettled`
   (`onDocumentUpdated('approval-requests/{id}')`) calls the settle route when the status moved
   to `rejected`, `expired` or `cancelled` and the kind is `workflow-resume`. The trigger ignores
   `approved`, `executed` and `failed`: the handler owns approvals, and a `failed` request leaves
   the run suspended until staff cancel it in `/admin/workflows`.
6. **Sweeps** (access context, run by the `approval-expiry-sweep` workflow of SP5 Task 7):
   - `expireApprovalRequests` stores `expired` on pending requests past `expiresAt`; the trigger
     then settles their runs.
   - `failInterruptedApprovals` implements decision 0030 A3: a request still `approved` 15 min
     after `updatedAt` becomes `failed` with `errorCode: EXECUTION_INTERRUPTED` and an
     `APPROVAL_FAILED` audit entry, one transaction each. It never re-executes.
   - Both read across tenants through the platform indexes `status+expiresAt` and
     `status+updatedAt`.
   - Expiry is not audited: no `APPROVAL_EXPIRED` action exists, and SP1's decision path already
     stores `expired` unaudited.

## Consequences

- One approvals inbox and one audit trail for agent commands and workflows.
- Forged resumes are harmless; the settle route only reconciles. The step also refuses to act
  when the restored context is not the stored requester's (a resume under another caller's
  context ends `failed` with `REQUESTER_MISMATCH`).
- Functions read `MASTRA_URL` (https outside local; `http://localhost:4111` by default in local)
  and `MASTRA_AUDIENCE`. A remote environment without `MASTRA_URL` fails each trigger event
  (retried, `MASTRA_URL_MISSING`) instead of the boot, so the other functions keep deploying.
  Deploy step: the Functions service account needs `roles/run.invoker` on the Mastra service.
- The core demo workflow `approval-demo` needs a permission with `requiresApproval`:
  `core.workflow-run.approve-demo` (SP5 Task 1).
- `approval-demo`'s `apply` step runs the module command `example.CreateNoteCommand` as the
  requester through a `WorkflowCommandPort` (SP3's command executors and at-most-once records,
  idempotency key `workflow:<runId>`). SP3 Task 19 (module commands) is deferred, so today no executor
  exists for that command and the real runtime ends the run with `UNKNOWN_COMMAND` after the
  approval; the tests bind a fake port. The command id is a parameter of the workflow factory.

## Alternatives rejected

- **Resume through Mastra's built-in route with the approver's token.** The approver's context
  would replace the requester's, and the Functions trigger has no token.
- **A Firestore listener in the Mastra process.** One more long-lived subscription per
  instance, without per-document retries; the trigger has them.
- **Trusting `resumeData.decision`.** Any runtime caller could release an action.
