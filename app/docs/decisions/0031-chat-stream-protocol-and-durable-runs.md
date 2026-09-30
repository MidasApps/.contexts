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
