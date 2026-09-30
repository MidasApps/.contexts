# SP4 Tasks 0, 1 and 2 report

Plan: `docs/plans/2026-09-29-sp4-chat.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-09-30.

## Commits

| Task | Commit | Message |
|---|---|---|
| 0 | `29751d9` | `docs(chat): record chat decisions` |
| 1 | `dc881da` | `docs(chat): record durable chat stream spike` |
| 2 | `c1e4f37` | `feat(agents): add durable chat routes for the ai sdk ui stream` |

I built them in the scratch worktree `wt-sp4-t0`, starting from `4cec94e`. I rebased them onto
the SP3 commit `9331591` (`feat(agents): expose core mcp server through v1`), then replayed them
onto the main index with `update-index`. The landed SHAs are in the table above; see "Landing".

## Task 0: decisions

Each SP4 id (D4-01 to D4-08) is recorded in exactly one decision:

| Decision | Records |
|---|---|
| 0031 | D4-01 (the AI SDK UI message stream through `/v1/chat`; a deviation from `api.md` §14 for chat only) and D4-02 (resume and stop) |
| 0032 | D4-03 (generative UI contracts) and D4-04 (inline approvals) |
| 0033 | D4-05 (conversation metadata in Firestore, messages in Mastra memory) |
| 0034 | D4-06 (voice) |
| 0035 | D4-07 (AI Elements with the pinned shadcn CLI) and D4-08 (attachments) |

## Task 1: spike

Report: `reports/spike-durable-chat.md`. The probe ran in the scratch worktree only. It used the
real SP3 runtime in fake mode, a durable supervisor, Mastra's Node server, and real HTTP with a
Bearer token.

| Item | Result |
|---|---|
| (a) `useChat`-compatible stream | PASS: `x-vercel-ai-ui-message-stream: v1`, reasoning parts, a delegation part, heartbeats; 401 without a token |
| (b) observe after a disconnect | FAIL with `chatRoute`, whose request signal aborts the run. PASS without that signal: a full replay from `start`, and the text matched |
| (c) abort | PASS: `publishAbortRequest` stops the run in about 80 ms and memory keeps the partial answer. It needs `memory: { thread, resource }` in the run options, because a durable agent ignores the thread and resource keys of the request context |
| (d) approvals | PASS, path A: the native AI SDK approval response resumes the run, the command runs once, and a replayed approval gets an error chunk |

Decisions 0031 and 0032 have amendments:

- The route is our own route over `handleChatStream`, not `chatRoute`.
- The server sets the run id and the memory.
- Path A is used; path B is not built.
- Resume works only on one instance: the replay comes from the per-process cache, not from PubSub.

## Task 2: Mastra chat routes

New files in `packages/agents/src/chat/`:

- **`chat-routes.ts`.** `POST /chat/:agentId` runs `handleChatStream` with:
  - `version: 'v7'`, `sendReasoning`, `sendSources`;
  - `closeOnSuspend: true`, so the stream ends at an approval and `useChat` reaches `ready`;
  - `withSseHeartbeat`, every 15 s.

  The body goes through `ChatRouteBodySchema`: exactly one message, plus an optional `trigger`.
  Every other key is dropped, so `maxSteps`, `memory`, `runId` and the like never pass.

  The route sets `runId` itself and returns it in `x-run-id`. It also sets
  `memory: { thread, resource }` from the context. It does not forward the request signal, so a
  disconnect never ends the run.

  An assistant message is accepted only as an approval response, and only for a run of the
  caller.

  The body is capped at 140 MiB, because `/v1` inlines up to 10 attachments of 10 MB each
  (decision 0035).
- **`observe-route.ts`.** `GET /chat/:agentId/runs/:runId/observe` calls durable `observe`:
  - It has a 30 s idle timeout and an `isAlive` check against the run owners.
  - It converts the output with `toAISdkStream` (v7).
  - It answers 204 when the run is unknown, belongs to someone else, or is suspended.
- **`abort-route.ts`.** `POST /chat/runs/:runId/abort` calls `publishAbortRequest` on the agent's
  PubSub and always answers 204. A foreign run is a no-op.
- **`chat-run-owners.ts`.** It records each run's owner: `runId → resource, thread, agent, state`.
  It is in process, with a 15 min TTL and at most 10 000 runs. `approvalRunIdsOf` reads
  `<runId>::<toolCallId>` the same way `@mastra/ai-sdk` does.
- **`tool-preview.ts`.** After each `data-tool-call-approval` it adds a `data-tool-preview` part:
  - the core tool id, found from the sanitized stream name;
  - the permission;
  - `summarize`;
  - `preview` (before and after), but only when SP1 `authorize` allows the call, so a preview
    never reads what the caller may not.

  The new `previewCoreToolCall` in `core-tool-pipeline.ts` builds it. MCP and connector tools
  get the name only. The same stream tap marks the run `suspended` or `finished`.
- **`durable-supervisor.ts`.** It wraps the supervisor with
  `createDurableAgent({ id: 'assistant-chat', cleanupTimeoutMs: 60 s })`. The wrapper gets the
  PubSub from `new Mastra({ pubsub })`, which SP3 Task 25 sets.
- **`chat-http.ts`.** It holds the §6 error envelope, `callerOf` and the capped JSON reader.

Changes to existing files:

- **`compose-agent-runtime.ts`.**
  - `agents` gains `assistant-chat`.
  - `RuntimeParts.chat` holds `{ chatAgents, owners, previewer }`.
  - `apiRoutes` gains the 3 chat routes.
  - `middleware` gains a context middleware instance on `/chat/*`.
- **`context-middleware.ts`.** It takes a `path` option.
- **`conversation-id.ts`.** `startsConversationRun` also matches `POST /chat/:agentId`. A chat
  turn without `X-Conversation-Id` therefore gets a new conversation owned by the caller, and
  a foreign conversation answers 403. This is the same logic `/api` uses.
- **`route-allowlist-middleware.ts`.** It takes `hiddenAgentIds`, so every
  `/api/agents/assistant-chat/*` route answers 404. The plan said "allow chat routes", but the
  chat routes are custom routes outside the prefix, so the allowlist never sees them.

`apps/mastra` needed no source change: its `index.ts` already spreads `runtime.agents` and
`runtime.apiRoutes`.

Dependency (`npm view`, 2026-09-30): `@mastra/ai-sdk` 1.10.5.

- It is the latest version, published 2026-09-24, under Apache-2.0.
- It peers `@mastra/core >=1.5 <2` and `zod ^3.25 || ^4`.
- It has no dependencies and no install scripts.
- It is pinned in `catalog:` and is a dependency of `@core/agents`. No release-age exclusion
  was needed.

**TDD.** Red was observed first: the three new test files failed on their missing modules. The
first green run then failed 3 tests:

- A test fixture passed `undefined` to a parameter with a default value.
- An aborted durable UI stream closes without a `finish` chunk. The spike had shown this too,
  and the test now asserts a partial text instead.
- A `toMatchObject` checked a key that should be absent.

## Verification

Before the rebase (worktree):

```
pnpm -F @core/agents typecheck / lint → clean
pnpm -F @core/agents test → 51 files, 426 passed, 1 skipped
  chat unit tests: chat-routes (11), chat-run-owners (7), tool-preview (6); auth + runtime updated
pnpm -F @core/mastra typecheck / lint / test → clean; 10 files, 52 passed
firebase emulators:exec --config firebase.sp4.json (own ports 39099/38080) --only auth,firestore
  "pnpm -F @core/mastra test:emulators && pnpm -F @core/agents test:emulators"
  → mastra 2 files, 11 passed (chat-routes.emulator 5: 401 + hidden /api agent; streaming with
    reasoning and agent-knowledge delegation, memory owned by tenant:uid, foreign conversation 403;
    stop through abort keeps the partial answer in memory, foreign abort 403; observe replays the
    same text, unknown run 204; approval round trip: data-tool-call-approval with the sanitized
    name, data-tool-preview, foreign approval 403, command runs once, replay runs nothing)
  → agents 1 file, 6 passed
pnpm -F @core/mastra build → Build successful
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

After the rebase onto `9331591` (worktree, fresh):

```
pnpm install --frozen-lockfile → lockfile up to date
pnpm -F @core/agents typecheck / lint → clean; test → 52 files, 431 passed, 1 skipped
pnpm -F @core/mastra typecheck / lint / test → clean; 10 files, 52 passed
emulators (same scratch config) → mastra 2 files, 12 passed (with the SP3 MCP test); agents 6 passed
```

## Landing

- **Conflicts.** The rebase conflicted only in `packages/agents/src/index.ts` and
  `compose-agent-runtime.ts`: the SP3 MCP exports and `buildMcpServers`. I kept both sides.
- **Replay.** I replayed each commit with `update-index`, using the worktree commit's blobs, and
  checked that the staged paths were exactly that commit's paths. `git diff 22162a9 c1e4f37` is
  empty.
- **SP2 files.** `app/pnpm-workspace.yaml` and `app/pnpm-lock.yaml` carry uncommitted SP2 hunks
  in the main tree.
  - Their committed blobs are HEAD plus my change only.
  - In the working tree, I applied the workspace hunk by hand.
  - I refreshed the lockfile with `pnpm install --prefer-offline`, so the SP2 hunks stay
    unstaged.
  - I staged no SP2 file.
- **Main tree check.** Agents typecheck is clean, and the chat, runtime and auth unit tests
  pass: 109.
- **Framework.** `framework-ok`.

## Deviations and concerns

1. **The route is not `chatRoute`.** `chatRoute` forwards the request signal and takes run
   options from the body. The replacement is `registerApiRoute` over `handleChatStream`, the
   same function `chatRoute` uses (decision 0031 amendment).
2. **Resume works only on one instance.** The replay comes from the durable agent's in-process
   `InMemoryServerCache`, and the run owners also live in process. A second Cloud Run instance
   answers 204, and the client falls back to reloading from memory. Cross-instance resume needs a
   shared cache, such as Redis (not in the stack), or session affinity. I did not add this to
   `follow-ups.md`, because that file has uncommitted SP2 rows (#32 to #35). It is recorded in
   decision 0031. Please add it as follow-up #36.
3. **Durable agents and the request context.** Memory must be passed as the `memory` option.
   Other durable callers would silently lose memory without it.
4. **Delegation shows as a `tool-agent-<id>` part.** In fake mode there is no `data-tool-agent`,
   because the fake subagents do not stream nested chunks. The plan's test wording expected
   `data-tool-agent`. The client (Task 9) must render delegation from the `tool-agent-*` part.
5. **An aborted durable stream has no `finish` chunk.** The UI stream just closes. `useChat`
   treats this as the end of the stream. `/v1` (Task 5) must clear `activeRunId` when the stream
   closes, not only on `finish`.
6. **Mastra logs `toModelOutput failed for tool "agent-action"`** when a subagent's result is
   suspended. It is a warning inside `@mastra/core` 1.71, and the run is not affected.
7. **`approvalRunIdsOf` accepts one run per message.** A message whose approvals name several
   runs answers 400. `@mastra/ai-sdk` can resume several runs, but a single turn never creates
   more than one.
8. **`/v1` must still audit approval decisions (Task 5).** Mastra runs the tool pipeline after
   an approval, and that pipeline audits `AGENT_TOOL_EXECUTED`. The approve and decline decision
   itself is audited only by `/v1`.
