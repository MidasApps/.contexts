# SP5 Tasks 0, 1 and 2 report

Plan: `docs/plans/2026-09-29-sp5-workflows-admin.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-09-30.

## Commits

| Task | Commit | Message |
|---|---|---|
| 0 | `e6f19bf` | `docs(workflows): record workflow and admin decisions` |
| 1 | `fff98d5` | `feat(contracts): add sp5 workflow, prompt, platform and trace contracts` |
| 2 | `0cc1697` | `feat(workflows): add human approval step on approval requests` |

How they were built:

- Each commit was built and verified in the scratch worktree `wt-sp5-t0`.
- Before Task 2 landed, main had moved (`9227336`, SP4's `458b786`). I rebased onto it (and again onto SP3's `ffb42d5`) without
  conflicts and ran the contracts tests, the services access and workflows tests and every
  typecheck again.
- Each commit was replayed onto the main index with `update-index`, using the worktree's
  blobs, after a check that the main index was empty and that main's HEAD held the parent
  blob of every path.
- Main's working tree was then synced. Paths without SP2 changes were checked out. Paths with
  SP2's uncommitted hunks got my patch applied on top:
  - `contracts/src/composition.ts`;
  - `contracts/src/index.ts` and `services/src/index.ts`: my block was appended;
  - `catalog.json`, `catalog.ai.json` and `openapi/v1.yaml`: regenerated in main with
    `contracts:catalog`, so they hold SP2's WIP and mine (`contracts:check ok`, 104 contracts).
- No SP2 file was staged.
- The commit header of Task 1 is shorter than the plan's, because the hook caps headers at 72
  characters.

## Task 0: decisions

The next free numbers were 0036–0041, checked right before writing. Each D5 id is in exactly one
decision (grep count 1 for D5-01 to D5-08):

| Decision | Records |
|---|---|
| 0036 | D5-01: workflow HITL on SP1 approval requests (design below) |
| 0037 | D5-02: schedules |
| 0038 | D5-03: prompt store |
| 0039 | D5-04 (flags) and D5-05 (plans and budgets) |
| 0040 | D5-06 (traces and evals) and D5-07 (progress SSE) |
| 0041 | D5-08: `/admin` composition |

## Task 1: contracts

- **Workflows.**
  - `HumanApprovalResume`: the four decisions, `decidedBy` and a reason of at most 500
    characters.
  - `WorkflowResumeActionInput`: `{ workflowId, runId, stepId }`.
  - `HumanApprovalSuspendSchema`.
  - `Schedule` with `CreateScheduleInput` and `UpdateScheduleInput`. The cron has 5 fields only,
    and seconds, years and `@daily` are refused. The IANA zone is required. `inputData` is
    opaque. The update needs at least one field.
  - `WorkflowRun` with Mastra's statuses, `StartWorkflowRunInput`, and `WorkflowEvent`, whose
    index is ≥ 0 so it can serve `Last-Event-Id`.
- **Agents.** `PromptVersion` and `PromptActivation` with their inputs. Tenant scope requires a
  `tenantId`, and platform scope forbids one. A forced activation needs a reason.
- **Platform.**
  - `Plan` and `UpsertPlanInput`: limits are non-negative integers, and features are unique.
  - `FeatureFlagDefinition` and `FeatureFlag`: owner and reason are required, and `expiresAt`
    must come after `createdAt`. I did not compare it with "now", which would make the check
    depend on the clock.
  - `SetFeatureFlagValueInput` and `AdminOverview`.
- **Observability.** `TraceSummary` (32-hex trace id), `TraceDetail` (flat span list, redacted
  I/O marked personal) and `EvalExperimentSummary`.
- **Usage and conversations.** `UsageDailyRollup` and `MessageFeedback` with its input (the
  comment is capped at 1000 characters).
- **Permissions.** `SP5_PERMISSIONS` in `core-permissions.ts`, spread into `CORE_PERMISSIONS`:
  - 13 tenant permissions of spec §2.1. The spec gives no roles for trace, eval, prompt and
    flag permissions, so I gave them to owner and admin.
  - Plus **`core.workflow-run.approve-demo`** (write, `requiresApproval: true`, members). SP1
    refuses an approval request whose permission does not require approval, and no core
    permission did.
  - 10 platform permissions: writes go to `platform-admin`, and reads (connector, trace, usage)
    also go to support.
- The services permission tests were updated for the new platform permissions.
- The contracts are registered through `SP5_CONTRACTS` (`contracts/sp5-contracts.ts`), so
  `composition.ts` gains one line.

## Task 2: workflow HITL (decision 0036)

What orientation showed, and what changed because of it:

1. **Nobody holds a user Bearer when a decision is applied.** The SP1 handler context has the
   approver but no token, and the Functions trigger has no user. The gateway's `resumeWorkflow`
   therefore cannot be used as the plan says. Mastra restores the snapshot's request context
   for the keys a resume does not set, so a resume **in process with an empty context** runs
   the remaining steps as the requester.
   - New custom Mastra route `POST /workflow-approvals/:approvalRequestId/settle`
     (`requiresAuth: false`, outside the API prefix). Its only input is the id. It reads the
     request from SP1, derives the decision and `decidedBy`, and resumes the named step.
   - A run that is not suspended, or that another caller already claimed, answers 200
     `{ settled: false, reason: "NOT_SUSPENDED" }`. A pending or failed request answers
     `NOT_SETTLED`. An unknown request or workflow answers 404, and an infrastructure error
     answers 500 with no details.
   - The route is protected by Cloud Run IAM outside local. The threat accepted in the decision:
     a caller inside the trust boundary can only force an early settle of a request SP1 already
     decided.
2. **The resume data is never trusted.** The route allowlist lets any authenticated runtime
   caller use `/api/workflows/**`. So on resume, `requestHumanApproval` re-reads the SP1
   request (new system read `getApprovalRequest`, with effective status) and requires the
   matching stored status (`approved` needs approved or executed) and the same
   workflow, run and step. Otherwise it suspends again.
   - `apply` also refuses when the restored context is not the stored requester's
     (`REQUESTER_MISMATCH`). This covers a resume made under another caller's context.
3. **Handler placement.** The handler lives in `@core/services`
   (`services/workflows/application/workflow-resume-approval-handler.ts`), not in `@core/agents`,
   for the same reason as SP3's `agent-command` handler: the web cannot import the runtime.
   - `registerWorkflowApprovals` is idempotent. `apps/web` registers it with the real settler.
     `apps/mastra` registers it with a fail-closed settler, only so SP1 accepts the kind.
   - The settler adapter `createMastraWorkflowApprovalSettler` sends only `X-Request-Id` and the
     serverless token. It maps errors by status like the gateway, never reads an error body,
     and times out after 60 s.
   - Handler refusal codes: `REQUESTER_UNAVAILABLE`, `WORKFLOW_NOT_SUSPENDED`,
     `APPROVAL_NOT_SETTLED`, `WORKFLOW_RUN_NOT_FOUND`, `UPSTREAM_UNAVAILABLE`.
4. **`example.CreateNoteCommand` does not exist.** SP3 Task 19 is deferred. `apply` runs the
   command through a new `WorkflowCommandPort`, bound in `apps/mastra` to SP3's executors and
   idempotency records:
   - SP1 re-authorizes the principal at the node;
   - the key is `workflow:<runId>`;
   - refusal codes are `UNKNOWN_COMMAND`, `REQUESTER_FORBIDDEN`, `COMMAND_INPUT_INVALID`,
     `TENANT_MISMATCH` and the idempotency codes.

   The command id is a parameter of the workflow factory. **In the real runtime today, an
   approved demo run ends `failed` / `UNKNOWN_COMMAND`.** The tests bind a note executor
   through a new test seam, `RuntimePortsAdapters.commandExecutors`.

Pieces:

- **`@core/agents`**
  - Ports `workflowApprovals` and `workflowCommands`, with fakes in `@core/agents/testing`.
  - `workflows/steps/request-human-approval.step.ts`.
  - `workflows/approval-demo.workflow.ts`: `collect-input` checks the permission →
    approval → `.branch` apply/record → `finish`.
  - `workflows/settle-workflow-approval.ts` and `workflows/workflow-approval-routes.ts`.
  - Both the workflow and the route are registered in `composeAgentRuntime`.
- **`apps/mastra`**: `workflow-ports-binding.ts`, which binds SP1 `requestApproval` with kind
  `workflow-resume`, `getApprovalRequest` and the command port.
- **`@core/services` access (SP1)**
  - `getApprovalRequest`.
  - `expireApprovalRequests` stores `expired` on overdue pending requests, one re-read
    transaction each. It writes no audit entry: the audit contract has no such action, the
    audit contract file is SP2-dirty, and SP1's decision path already stores `expired`
    unaudited.
  - `failInterruptedApprovals` implements **decision 0030 A3**. A request still `approved`
    15 min after `updatedAt` becomes `failed` with `EXECUTION_INTERRUPTED` and an
    `APPROVAL_FAILED` audit entry, in one transaction, and is never re-executed.
  - Repository `listByStatusBefore`, and indexes `approval-requests status+expiresAt` and
    `status+updatedAt`. The index test allowlists them as platform sweep indexes. The
    scheduled `approval-expiry-sweep` workflow that calls both sweeps is Task 7.
- **`apps/functions`**
  - `onApprovalRequestSettled` (`onDocumentUpdated('approval-requests/{id}')`, retry on). It
    settles `workflow-resume` requests that became rejected, expired or cancelled, and ignores
    approved, executed and failed ones.
  - `MASTRA_URL` and `MASTRA_AUDIENCE` env: https outside local, with a local default. When
    `MASTRA_URL` is missing remotely, each event fails and is retried, while the boot still
    succeeds.
  - The Functions emulator loads the definition: `Loaded functions definitions from source:
    healthz, onApprovalRequestSettled, onFileFinalized`.

## Verification (fresh, in `wt-sp5-t0`)

Scratch `firebase.scratch-sp5.json`, never committed: auth 47099, firestore 47080, ws 47150,
functions 47001, storage 47199, hub 47400, logging 47500. The 5xxxx hub port was taken.

```
pnpm -F @core/contracts test          → 33 files, 386 passed (after the rebase onto 458b786)
pnpm contracts:check                  → ok (102 contracts in the worktree; 104 in main with SP2 WIP)
pnpm -F @core/services test           → 95 files, 689 passed
pnpm -F @core/agents test             → 54 files, 441 passed, 1 skipped (real Firecrawl smoke)
pnpm -F @core/agents test:postgres    → 5 files, 22 passed (incl. approval-demo.workflow.postgres 8/8)
pnpm -F @core/mastra test             → 13 files, 65 passed (first turbo run: the known flaky
                                        create-runtime-ports timeout of SP3 concern 7; passed on rerun)
pnpm -F @core/functions test          → 4 files, 27 passed;  pnpm -F @core/web test → 5 files, 30 passed
turbo lint + typecheck (contracts, services, agents, mastra, functions, web) → clean; tsc again after rebase → clean
pnpm -F @core/functions build         → ok
emulators (auth, firestore):
  mastra   src/mastra/workflow-hitl.emulator.test.ts            → 3 passed
  functions src/approvals/on-approval-request-settled.emulator  → 3 passed
  services access + agents emulator tests                       → 7 files, 24 passed
  services firestore-approval-sweeps.emulator.test.ts           → 1 passed
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

Key evidence:

- **Postgres (`approval-demo.workflow.postgres.test.ts`)**
  - Suspends after creating the request as the requester. The summary names the note.
  - `supportsConcurrentUpdates()` is true on `PostgresStore`. Two concurrent settles give one
    `settled: true` and one `NOT_SUSPENDED`, and the command runs once, as the requester, with
    key = run id.
  - Reject and expire end on `record`, with nothing applied.
  - A forged `resume({ decision: "approved" })` while the request is pending leaves the run
    suspended. A resume under another user's context ends `REQUESTER_MISMATCH`.
  - A refused command ends `failed` with its code.
- **Emulators, on a real Mastra Node server (`workflow-hitl.emulator.test.ts`)**
  - The member starts `approval-demo` through the `/v1` gateway with an Auth Emulator token,
    and the run is suspended. The SP1 request is in Firestore, pending, requested by the
    member, kind `workflow-resume`.
  - The member's own approval → `SELF_APPROVAL_FORBIDDEN`.
  - The admin's approval → `executed`, and the note executor ran once with the **member**
    principal. The run result is `applied` with `decidedBy` = admin.
  - A second approval → 409. A replayed settle → `NOT_SUSPENDED`.
  - A rejection followed by the trigger's settle → `record`, with nothing applied.
  - A forged resume through `/api/workflows/approval-demo/resume` with the member's token
    leaves the run suspended.

**TDD.**

- Red was observed first for:
  - the contracts and permission tests (modules missing, 5 permission tests failing);
  - `approval-sweeps.test.ts` (4 failing);
  - the services `workflows` tests (3 files, modules missing);
  - `approval-demo.workflow.postgres.test.ts` (module missing).
- These were written together with their code:
  - the settle-route unit test;
  - the `apps/mastra` binding test;
  - the Functions env case;
  - the three emulator tests.

## Deviations and concerns

1. **Settle route instead of a gateway resume.** This is the plan's `resumeWorkflow(runId,
   stepId, …)`, redesigned as explained in Task 2 above and in decision 0036.
2. **Handler placement.** The handler is in `@core/services`, not
   `packages/agents/src/approvals/`.
3. **`example.CreateNoteCommand` has no executor** until SP3 Task 19. Task 15's "note created"
   in the e2e test is blocked on it.
4. **The Functions trigger emulator test calls the handler directly**, with real Firestore
   emulator snapshots written by SP1's repository. It does not go through the Functions
   emulator worker, which would need a reachable fake Mastra and env plumbing in the shared
   `.env.demo-core`. The trigger wiring is checked by the emulator loading it.
5. **A `failed` `workflow-resume` request leaves its run suspended.** Examples: Mastra was
   unreachable during the approval, or the 0030 A3 sweep ran. The trigger ignores `failed`, and
   staff will cancel such runs in `/admin/workflows` (Task 13).
6. **The approve call waits for the resume.** The `/v1` approve call returns only when the
   run reaches its next suspension or its end. This is fine for `approval-demo`; long
   post-approval work should run asynchronously.
7. **Deploy step, not verified against a real project.** The Functions service account needs
   `roles/run.invoker` on Mastra, with `MASTRA_URL` and `MASTRA_AUDIENCE` set in
   `.env.<projectId>`.
8. **New shared exports.**
   - `@core/services`: the workflows context, and `createFirestoreApprovalRequestRepository`,
     which the Functions emulator test uses.
   - `@core/agents`: the workflow step, workflow and route.
   - `@core/contracts`: the SP5 contracts.
