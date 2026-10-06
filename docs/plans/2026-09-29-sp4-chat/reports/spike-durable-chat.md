# SP4 Task 1 spike: durable chat stream, observe, abort and approvals

Plan: `docs/plans/2026-09-29-sp4-chat.md`, Task 1. Date 2026-09-30. Versions: `@mastra/core` 1.71.0,
`@mastra/ai-sdk` 1.10.5, `ai` 7.0.122, `@mastra/deployer` 1.71.0.

## Probe

A throwaway Vitest file lived only in the scratch worktree (`wt-sp4-t0`,
`packages/agents/src/spike/`) and was deleted before any commit. It built:

- the real SP3 runtime (`composeAgentRuntime`) in `AI_MODE=fake`, with fake SP1 ports, an
  `InMemoryStore` and a `PgVector` on the local Postgres (so memory existed);
- the `assistant` supervisor wrapped with `createDurableAgent({ agent })` (default
  `EventEmitterPubSub`, default `InMemoryServerCache`);
- Mastra's Node server (`createNodeServer`) with `FirebaseMastraAuth`, the SP3 middleware and
  one more `createContextMiddleware` instance on `/chat/*`;
- two routes: `chatRoute({ path: '/chat/:agentId', version: 'v7', sendReasoning, sendSources,
  heartbeatMs: 200, defaultOptions: { closeOnSuspend: true } })`, and a probe route
  `/chat-nosignal/:agentId` that calls `handleChatStream` (v7) without forwarding the request
  signal.

Requests were real HTTP with a Bearer token. The SSE frames were parsed by hand and rebuilt into
UI messages with `readUIMessageStream` from `ai` 7.

## Results

| Item | Result | Evidence |
|---|---|---|
| (a) `useChat`-compatible stream | **PASS** | 200, `content-type: text/event-stream`, `x-vercel-ai-ui-message-stream: v1`, `x-accel-buffering: no`. Frames: `start` (with `messageId`), `start-step`, `reasoning-start/delta/end` (from `[[fake:reasoning]]` with `sendReasoning`), `tool-input-start/delta/available` and `tool-output-available` for `agent-knowledge`, then `text-*`, `finish-step`, `finish`, `[DONE]`. `: heartbeat` comments appear while idle. No token → 401 (`registerApiRoute` defaults to `requiresAuth: true`). |
| (b) disconnect, then `observe(runId)` | **FAIL with `chatRoute`, PASS without the request signal** | `chatRoute` passes `abortSignal: c.req.raw.signal` into the run, so a client disconnect after 3 frames **aborted the run**: `observe` then saw `start, step-start, response-metadata, text-start, finish` and no text. Through `handleChatStream` without that signal, the run survived the disconnect, and `observe(runId)` replayed the whole run from the start: 19 chunks, text 320/320 characters, identical to the full answer. `observe(runId, { offset: 3 })` after the finish replayed from the fourth chunk. A caller-chosen `runId` in the options is honored, so the proxy knows the run id before the stream starts. |
| (c) abort stops generation and keeps the partial answer | **PASS, with one precondition** | `publishAbortRequest(durable.pubsub, runId)` from outside the request ended the stream in 83 ms with a normal `finish`. With `memory: { thread, resource }` in the run options, memory held the user message and the partial assistant text (4 deltas), plus the generated title. **Precondition:** a durable agent ignores `MASTRA_THREAD_ID_KEY` / `MASTRA_RESOURCE_ID_KEY` in the request context. Without the `memory` option it saved nothing at all, even for completed runs. The plain agent reads them from the request context and saved the user message. |
| (d) approval round trip | **PASS, path A** | With `closeOnSuspend: true` the first stream ends at the suspension: `tool-input-*` for `agent-action`, then `tool-approval-request` with `approvalId = "<runId>::<toolCallId>"` and `data-tool-call-approval` (`runId`, `toolCallId`, sanitized `toolName: command_tenancy_CreateProjectInput`, `args`, `resumeSchema`). `readUIMessageStream` builds the assistant message with the `tool-agent-action` part in state `approval-requested`. Sending that one assistant message back with the part in `approval-responded` (`approved: true`) made `handleChatStream` find the approval (`extractV6NativeApprovals`, used for v7 too) and call `resumeStream` on the durable agent. The command ran once (`projects.created = [{ name: "Launch" }]`), and the stream carried `tool-output-available` and the final text. Sending the same approval again answered an `error` chunk, and the command was not run twice. Without `closeOnSuspend` a durable stream stays open across the suspension, so `useChat` would never reach `ready`. |

Other observations:

- **No `data-tool-agent` in fake mode.** Delegation shows as a `tool-agent-<id>` tool part, both
  on the durable and on the plain supervisor. `@mastra/ai-sdk` builds `data-tool-agent` only from
  nested agent chunks a subagent streams through the tool writer, and the fake subagents return
  their result in one piece. The client renders delegation from the `tool-agent-*` part and
  treats `data-tool-agent*` as an optional enrichment.
- The approval part belongs to the supervisor's `agent-action` call. The sanitized command name
  is only in `data-tool-call-approval`. SP3 concern 3 holds.
- The replay comes from the durable agent's `MastraServerCache` (in memory, per process), not
  from PubSub. `GoogleCloudPubSub` carries events and abort requests across instances, but a
  second instance has no cached history to replay. Cross-instance observe needs a shared cache
  (Redis, which the stack does not have) or sticky routing. Until then, resume is a
  single-instance feature. It degrades to the fallback: 204, then reload from memory.
- The built-in `/api/agents/:agentId/observe` route does not check who owns the `runId`, and the
  native approval path takes the `runId` from the client-sent message. The Mastra side
  therefore needs its own run-ownership check. `/v1` checking it alone is not enough.
- A durable run's registry entry and cache are cleaned up 30 s after `finish` (the
  `cleanupTimeoutMs` default). An `observe` after that would wait for ever unless
  `idleTimeoutMs` is set.

## Decision

- **§4.2 — primary design, adapted.**
  - The supervisor is served as a durable agent (`createDurableAgent`, the runtime's PubSub).
  - The chat route is our own `registerApiRoute('/chat/:agentId')` over `handleChatStream`
    (`version: 'v7'`, `sendReasoning`, `sendSources`, `closeOnSuspend: true`, heartbeat
    `withSseHeartbeat(…, 15000)`), **not** `chatRoute`, for three reasons:
    1. The request signal must not abort the run.
    2. The server must set `memory: { thread, resource }` and `runId` itself.
    3. Only `messages` and `trigger` may come from the body.
  - The route answers `x-run-id` and records the run's owner (`resourceId`, `threadId`).
  - Resume is `GET /chat/:agentId/runs/:runId/observe`: an owner check, then `observe` with an
    idle timeout, converted with `toAISdkStream(…, v7)`. It is a full replay from `start`, and
    it answers 204 when the run is unknown.
  - Stop is `POST /chat/runs/:runId/abort`: an owner check, then `publishAbortRequest`, then 204.
  - Resume stays single-instance until a shared cache exists (follow-up).
- **§4.4 — path A.** The native AI SDK approval works through the same chat route.
  - `/v1/chat` forwards the assistant message that carries the `approval-responded` part.
  - `/v1` audits the decision before forwarding it.
  - The Mastra route refuses an approval whose `runId` belongs to another owner.
  - `tool-approvals` (path B) is not needed. `data-tool-preview` is emitted next to
    `data-tool-call-approval` from the tool definition's `summarize` and `preview`.

Decisions 0031 (D4-02) and 0032 (D4-04) have new amendments.
