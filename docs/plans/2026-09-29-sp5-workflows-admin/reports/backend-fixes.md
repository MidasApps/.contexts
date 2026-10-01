# SP5 backend fixes report

Plan: `docs/plans/2026-09-29-sp5-workflows-admin.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-10-01.
Sources of the items: concerns 1, 3, 4, 8 and 12 of `task-8-11.md`.

## Commits

| Item | Commit | Message |
|---|---|---|
| 1 | `a8edfea` | `fix(agents): pass core error codes of mastra answers to /v1` |
| 2 | `76caecc` | `fix(mastra): bundle the eval sets so prompt evals run in the build` |
| 3 | `6faaeab` | `feat(workflows): hold schedule fires while workflows.schedules is off` |
| 4 | `4032e67` | `fix(admin): never loosen budget caps on a failed write` |
| 5 | `617ce40` | `feat(admin): compute active users, approval rate and eval status` |

How they were landed:

- Every commit was built and verified in the scratch worktree `wt-fix-be`.
- Each commit was replayed onto main's index with `update-index`, using the worktree blobs.
- Before each replay, the landing script checked three things:
  - there was no `index.lock`;
  - the index held no entry;
  - main's tree equaled the commit's parent tree.
- After each commit, it checked that the staged paths were exactly the commit's paths and that the
  trees were identical.
- None of the 40 paths has an uncommitted SP2 hunk in main. So main's working tree was synced with
  a checkout of those paths only, and nothing of SP2 was staged.

## Item 1: `FEATURE_DISABLED` reaches `/v1` chat and voice

- **The change.**
  - `mapMastraError` (`mastra-error-mapper.ts`) reads only the `code` of Mastra's §6 envelope.
  - The code passes when it is in `CORE_ERROR_CODES`, with Mastra's status. `VALIDATION_FAILED` is
    always 400, and `RATE_LIMITED` keeps `Retry-After`.
  - Otherwise, the caller's own status mapping applies (voice's `mapVoiceStatus`), then
    `mapMastraStatus`.
  - The message and details are never read.
- **Where it applies.**
  - The raw calls: `callRawRoute` (chat and voice), `postForStream` and `postMcp`.
  - The `@mastra/client-js` path (`MastraClientError.body`). So the agent and MCP routes also pass
    the kill-switch's 503.
  - The body is read only when it is JSON; any other body is cancelled unread.
- **An upstream `INTERNAL_ERROR` never passes.** Mastra is upstream of `/v1`, so its crash stays
  502 `UPSTREAM_UNAVAILABLE`.
- **Type.** `GatewayErrorCode` is now `Exclude<CoreErrorCode, "INTERNAL_ERROR">`; it was a closed list
  of 8 codes. The route handlers already answer through `gatewayErrorResponse`, so nothing
  downstream re-maps the code.
- **Tests.**
  - Chat: 503 `FEATURE_DISABLED` passes. An unknown code, a non-JSON 503 and a 500 `INTERNAL_ERROR`
    all fall back to 502.
  - Voice (new `mastra-voice-gateway.test.ts`): `FEATURE_DISABLED` wins over the voice gate. A bare
    503 and `FEATURE_UNAVAILABLE` stay `FEATURE_UNAVAILABLE`. A 413 `PAYLOAD_TOO_LARGE`, which is not
    a core code, stays 400 `VALIDATION_FAILED`.
  - Client-js `generate`: 503 `FEATURE_DISABLED` passes, and the message never does.
  - Red was observed first for the chat and voice cases.

## Item 2: eval sets in the Mastra bundle (decision 0038 amendment)

- **Root cause.** In the bundle, `EVALS_DIR` (`resolve(import.meta.dirname, "../../evals")`) pointed
  at `apps/mastra/evals`, which does not exist. The control run below logged that path in its
  ENOENT.
- **Bundle and lookup.**
  - `copy-agent-assets` now copies `packages/agents/evals` (datasets and baselines) into
    `src/mastra/public/evals`, which is gitignored. The asset list is shared in
    `src/build/agent-assets.ts` (`AGENT_ASSETS`).
  - `EVALS_DIR = resolveEvalsDir([<bundle>/evals, <package>/evals])`: the first candidate that holds
    a `datasets` folder.
- **Build check.** `check-mastra-output` gained a step: every source file of the instructions,
  skills and evals must exist in `.mastra/output`, else the build fails (`missingBundledAssets`). The
  Dockerfile comment was updated.
- **Measured** (`AI_MODE=fake`, own emulators on 47xxx, Mastra on 4291):
  - The build passed every step: `copy-agent-assets` copied the evals; `check-mastra-output`
    reported the output pins matching the workspace lockfile, `agent assets present: instructions,
    skills, evals`, and no high or critical advisory.
  - `node .mastra/output/index.mjs` was run with a probe platform `data` version
    (`POST /prompt-evals/:versionId` `{"tenantId":null}`). It answered **200** with
    `verdict: "passed"`, scorers `tool-routing`, `tenant-leak` and `format-compliance`.
  - Control: the same call with `output/evals` moved away answered **502**, with ENOENT on
    `apps\mastra\evals\datasets\data.v1.jsonl`.
  - The probe version row was deleted afterwards. Its experiment record stays in the local Mastra
    storage.
- **Tests.** `resolveEvalsDir` (bundled copy first, else the package folder) and
  `missingBundledAssets` (a missing file, a complete copy, an empty source). Red was observed first.

## Item 3: `workflows.schedules` and `ai.memory.observational` (decision 0037 A2, 0039 amendment)

- **Schedules.**
  - `gateScheduleFires` wraps the `schedules` domain of the storage the runtime hands to Mastra.
    While the flag is off for the environment, `listDueSchedules` returns nothing, so no tenant
    **or platform** schedule fires on any instance.
  - Mastra's `SchedulerWorker` polls `listDueSchedules` through `storage.getStore("schedules")`
    every tick.
  - What is not affected:
    - rows, their `paused` state and `nextFireAt` stay untouched;
    - `mastra.schedules` (create, pause, run-now) keeps working.
  - When the flag is on again, each missed schedule fires **once**. There is no backfill.
  - The flag is read through the 30 s flag cache with fallback `true`. A store failure keeps firing,
    because the platform crons expire approvals and purge data.
  - Pause and resume are logged: `schedule_fires_paused` and `schedule_fires_resumed`.
- **Observational memory.** `ai.memory.observational` is documented as a **boot-time** flag:
  - `AI_MEMORY_OBSERVATIONAL` decides it when the process starts;
  - a value stored from `/admin` is shown but changes nothing, even after a restart.
  - The registry reasons and the ADR say so. Reading it per request would need two memories chosen
    per call, which is not cheap.
- **Tests** (`schedule-fire-gate.test.ts`, in-memory store):
  - no due row while off, the row once on, and the row itself untouched;
  - a throwing read keeps firing;
  - a real Mastra scheduler `tick()` does not fire while off, then fires once (`lastRunId
    sched_<id>_<old nextFireAt>`) when on.

## Item 4: budget writes never loosen the caps (decision 0039 amendment)

- **Choice: tighten, write, materialize.** `changeTenantBudget` runs three steps:
  1. Postgres gets the element-wise **lower** of the caps before and after the change
     (`tightenTenantBudget`);
  2. the input is written to Firestore;
  3. the caps are materialized again from the stored inputs (`syncTenantBudget`).
- A failure at step 2 or 3 throws (500) and leaves caps tighter than both the old and the new
  intent until that tenant's next write.
- **Why not plain "Postgres first".** A failed **raise** would then enforce caps that the inputs
  never recorded.
- **Why not "reconcile on read".** `checkTenantBudget` is the runtime hot path and reads Postgres
  only.
- **Callers.** All four now go through it:
  - plan assignment and staff override (`update-organization-admin.ts`);
  - tenant self-cap (`update-agent-settings.ts`);
  - plan update (`upsert-plan.ts`). It tightens every organization on the plan **before**
    `plans.replace`, and checks that the plan exists first, so an unknown plan writes nothing.
- **Tests** (`sync-tenant-budget.test.ts`, failing fakes):
  - the order of the writes is the tightened caps, then the new caps;
  - a failed raise keeps the old caps;
  - a lowered plan whose Firestore write fails is enforced;
  - a lowered plan whose final upsert fails is enforced;
  - a failed plan raise keeps every tenant's caps;
  - an unknown plan writes nothing;
  - a self-cap lift that fails keeps the lower cap.
- **Postgres test.** A lowered plan whose assignment write fails still refuses the run through
  `checkTenantBudget`. Red was observed first for the three lowering cases.

## Item 5: admin overview metrics (decision 0039 amendment)

- **Active users (7 days).** `listActiveUserIds`: `SELECT DISTINCT user_id` from `usage.llm_calls`
  per active organization, as `usage_runtime` under RLS, skipping rows without a user. The union
  across organizations is counted, so a user of two organizations counts once.
- **Approval rate (7 days).**
  - `createFirestoreApprovalStats` runs two count aggregations on `approval-requests` over the
    existing `status + updatedAt` index.
  - approved = `approved`, `executed` or `failed`; rejected = `rejected`; 0 without decisions.
  - Caveat: `updatedAt` also moves on execution.
- **Eval status.**
  - The latest finished experiment (verdict not `pending`, sorted by `finishedAt`) among 50 from the
    runtime console, across tenants and sources.
  - `unknown` without one, without a console, or when the console fails.
  - The web passes its console gateway (`createFirebaseConsoleServices({ evals })`). Mastra's own
    call doesn't, and its overview is never served.
- **Tripwire rate stays 0**, with the reason in the use case and the ADR: a guardrail stop aborts
  the run, but no audit action or ledger column records it.
- **Tests.**
  - Use case: distinct users across organizations, suspended organizations and the window excluded;
    the approval rate and its window; the latest verdict; `unknown` in all three cases; tripwire 0.
  - Postgres: distinct users of one tenant, nulls and the other tenant excluded.
  - Emulator: counts in a window no other suite writes in.

## Verification (fresh, in `wt-fix-be`, final tree = `617ce40`)

Scratch `firebase.fixbe.json` was never committed. Its ports: auth 47099, firestore 47080, ws 47150,
storage 47199, hub 47400, logging 47500. Mastra ran on 4291.

```
turbo test typecheck lint (contracts, services, agents, mastra, web, scripts) → 18/18 tasks ok
  unit: contracts 34 files/389 · services 121/828 · agents 72/520 (+1 skipped) · mastra 14/67
        · web 5/30 · scripts 14/65 → all passed
postgres: services 8 files/44 · agents 7/27 → passed
emulators (auth, firestore, storage; own ports): services 35 files/179 · agents 1/6 · mastra 7/31 → passed (services: firebase-rules.emulator.test.ts failed once in the first full run, the known shared-state flake of task-8-11 concern 11; the full rerun passed 35/179)
pnpm -F @core/mastra build (final tree) → ok (pins match, agent assets present, audit: no high or critical)
built service boot + POST /prompt-evals/:versionId (fake) → 200 passed; without output/evals → 502
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

**TDD.** Red was observed first for:

- items 1, 2 and 5, and the gate unit test of item 3: the module or behavior was missing;
- item 4: the three lowering cases.

The Mastra-level scheduler test of item 3 and the overview's `unknown` and tripwire cases passed on
their first run.

## Concerns and follow-ups

1. **Follow-up rows to add** to `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`. That file
   carries SP2 WIP, so it was not touched; the coordinator should add:
   - read `ai.memory.observational` from the flag store once at boot, so the `/admin` toggle
     applies on restart. Today `AI_MEMORY_OBSERVATIONAL` governs;
   - persist guardrail tripwires (audit action or ledger column), then compute the overview's
     tripwire rate;
   - give `EvalExperimentSummary` its source (`ci`, `prompt-eval`, tenant) so the overview can
     report the CI gate verdict alone. Today it reports the latest finished experiment of any
     source;
   - optionally refuse schedule creation (503 `FEATURE_DISABLED`) while `workflows.schedules` is
     off. Today creation works and the rows wait.

   The rows already listed in `task-8-11.md` §14 for these items (`FEATURE_DISABLED` at `/v1`, the
   eval sets in the bundle, the overview metrics) are now **done**.
2. **`workflows.schedules` off also stops the platform crons**: the approval expiry sweep,
   conversation purge, usage report, eval export and catalog reindex. This is intended, as a global
   switch, and recorded in decision 0037 A2. Operators should know that expiry and purge wait while
   it is off.
3. **Overview cost.** The overview runs one ledger read per active organization, plus the distinct
   user ids, which are held in memory for the union. This is fine for the v1 scale; a platform
   rollup is the follow-up when organizations grow.
4. **Local side effects of the boot check.**
   - The built service created the five `schedule_platform-*` rows in the shared local Mastra
     storage, as any boot does.
   - One prompt-eval experiment record stays there.
5. **Accidental emulator run.** One early `vitest run` without `--project unit` started the emulator
   project with no emulator running. Those files failed to connect: nothing was listening on the
   default ports, and no shared state was touched. Every later run used the `unit`, `postgres` or
   own-port emulator projects.
6. **Left in the scratchpad.** The worktree `wt-fix-be`, `firebase.fixbe.json` and the scripts in
   `fixbe/` stay there; none was committed.
