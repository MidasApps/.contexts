# 0031. Chat stream protocol, resume and stop

- **Status:** accepted (D4-02 gated by the SP4 Task 1 spike; see Amendments)
- **Date:** 2026-09-30
- **Scope:** `app/packages/agents/src/chat`, `app/packages/services/src/services/conversations`, `app/apps/web/src/app/v1/chat` (local decision; the framework is unchanged)
- **Records:** SP4 spec D4-01, D4-02 (§3, §4.2, §7)

## Context

`useChat` (AI SDK 7) reads only the AI SDK UI message stream: SSE `data:` lines with the
header `x-vercel-ai-ui-message-stream: v1`. `contracts/api.md` §14 names SSE events
`data|error|done`, which `useChat` cannot read. Mastra stays private (umbrella §16.3), so
`/v1` must carry the stream. `stop()` in `useChat` only closes the connection, and resuming
a stream needs server support.

## Decision

1. **D4-01 — protocol.** Chat uses the AI SDK UI message stream end to end. Mastra serves it
   with `@mastra/ai-sdk` (always `version: 'v7'`; the package defaults to `v5`), and
   `/v1/chat` validates, authorizes, keeps the conversation metadata and pipes the bytes
   through unchanged, adding `x-request-id` and `x-conversation-id`. This is a documented
   deviation from `api.md` §14 **for chat only**; workflow progress streams (SP5) keep §14.
   Errors before the stream starts still use the §6 envelope.
2. **D4-02 — resume and stop.** Primary design: the supervisor runs as a Mastra durable agent;
   `/v1/chat` stores the run id as `activeRunId`; resume re-attaches through Mastra `observe`
   and stop sends a remote abort request. Fallback when the spike fails: plain agent stream;
   resume answers 204 when the run is gone and the client reloads messages from memory
   ("resposta interrompida" + regenerate); stop = client abort propagated by `/v1` to Mastra.

## Consequences

- One stream format for web and desktop; `/v1` never re-encodes chunks.
- Resume and stop need Mastra routes the gateway calls by run id; both are owner-checked.
- Heartbeat comments (15 s) keep proxies from closing idle streams.

## Alternatives rejected

- **`api.md` §14 events for chat.** `useChat` cannot read them; a client adapter would re-implement the SDK's parser.
- **`handleChatStream` inside Next.** Puts Mastra in the web process, against umbrella §16.3.
- **AI SDK `resumable-stream` + Redis.** No Redis in the stack.

## Amendments

- **2026-09-30 — spike result (SP4 Task 1, `docs/plans/2026-09-29-sp4-chat/reports/spike-durable-chat.md`).**
  The primary design holds, with these changes:
  - The chat route is our own `registerApiRoute('/chat/:agentId')` over `handleChatStream`
    (`version: 'v7'`, `closeOnSuspend: true`, SSE heartbeat every 15 s), not `chatRoute`.
    `chatRoute` forwards the request signal, so a client disconnect aborts the run and nothing is
    left to observe.
  - The route itself sets `runId` (returned in `x-run-id`) and `memory: { thread, resource }`
    from the verified context: a durable agent ignores the thread and resource keys of the
    request context.
  - The body contributes only `messages` and `trigger`.
  - Resume is `GET /chat/:agentId/runs/:runId/observe`: a full replay from `start`, and 204 for
    an unknown run.
  - Stop is `POST /chat/runs/:runId/abort` (`publishAbortRequest`). An aborted run keeps the
    partial answer in memory.
  - Both routes check that the run belongs to the caller.
  - Replay comes from the durable agent's in-process cache, not from PubSub, so resume works
    only on the instance that runs the stream until a shared cache exists. On any other
    instance it degrades to the fallback (204, then reload from memory).
- **2026-09-30 — `/v1/chat` and multi-instance resume (SP4 Tasks 5–7).**
  - `/v1/chat` stores the run of `x-run-id` as the conversation's `activeRunId` before it answers,
    and clears it when Mastra closes the stream, with or without `finish` (an aborted durable run
    just closes), or when `POST …/stop` aborts it. A client that disconnects only cancels its read:
    the run goes on and `activeRunId` stays, so `GET …/stream` can resume it. A run older than
    15 min (Mastra `server.timeout`) counts as gone. Only the end that clears the run counts the turn.
  - The context middleware of `/chat/*` caps the body before anything reads it: a declared
    `Content-Length` above 140 MiB answers 413, a body without one 411.
  - **v1 choice for several Mastra instances: Cloud Run session affinity.** The replay cache of a
    durable run and the run owners (`ChatRunOwners`) live in the process that runs the stream. On
    another instance the routes fail closed: resume answers 204 (the client reloads the messages),
    stop is a no-op (the run finishes by itself), and an approval answers 403. None of them ever
    acts on another member's run. Production therefore runs the Mastra service with session
    affinity, and the gateway must send the affinity cookie of the conversation's run with resume,
    stop and approval calls. That cookie forwarding is not built: until it is, deploy the chat with
    one Mastra instance (`max-instances=1`). The follow-up is a shared run-owner store in Mastra's
    Postgres storage plus a replay that does not depend on the process (PubSub-backed observe or a
    shared cache).

- **2026-10-01 — the answer's confidence travels as message metadata (SP4 Tasks 11–13, follow-up #42).**
  - The citation guard grades the knowledge subagent's own message, which the chat never shows: the
    member reads the supervisor's answer, and the knowledge answer reaches it as the output of the
    `agent-knowledge` tool call. A probe of the fake-mode stream showed no `messageMetadata` at all, so
    "sem certeza" could not show, live or after a reload.
  - The guard now writes `low | normal`, the values of `MessageMetadataSchema` (the contract is the
    source; `grounded` is gone).
  - `chat/answer-confidence.ts` grades a knowledge delegation output with the guard's own rule (`low`
    when the answer cites no passage retrieved in that delegation; several delegations are `normal`
    once any is). The chat stream tap writes it as a `message-metadata` chunk right after the
    delegation's `tool-output-available` (live and on observe), and the history route sets it on stored
    answers when it reads them. Nothing is written to memory, so the two always agree.
  - The client passes `MessageMetadataSchema` to `useChat`: metadata outside the contract fails the
    stream instead of being shown. The badge shows while the answer streams.
