# Spec — SP4 Chat

- **Status:** draft for execution (planner output, 2026-09-29)
- **Umbrella:** `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §8, §13 (SP4), §16.2, §16.3
- **Origin prompt:** `docs/prompts/2026-09-29-agentic-app-core-harness.md` item 9 (and UI stack: AI Elements)
- **Depends on:** SP3 (`docs/superpowers/specs/2026-09-29-sp3-agentic-runtime-design.md`): agents,
  `MastraGateway`, `files` context, voice routes, fake models; SP2: `@core/client` FSD
  package, `shared/ui` (shadcn new-york + Radix, Tailwind 4, tokens from `.design-system/DESIGN.md`),
  `SchemaForm`, router port, i18n, the web `(app)` shell and the Tauri shell.
- **Plan:** `docs/plans/2026-09-29-sp4-chat.md`

## 1. Scope and gate

A chat widget shared by web and desktop: multi-agent streaming with visible delegation,
tool calls, reasoning and workflow steps; stop and resume; generative UI; inline tool
approval with audit; conversation history (list, search, rename, pin, archive, delete,
summarize); uploads (file, image, video) as multimodal parts or KB ingestion; voice
(push-to-talk STT + TTS; realtime optional).

**Gate (umbrella §13):** Playwright e2e with `AI_MODE=fake`: streaming, delegation,
`renderForm` → submit, approval with audit, upload, voice, history. axe clean on the chat
page.

## 2. Facts relied on (2026-09-29)

- `ai` 7.0.122 / `@ai-sdk/react` 4.0.125: `useChat({ transport, id, messages, resume,
  messageMetadataSchema, dataPartSchemas, sendAutomaticallyWhen, onData, onFinish })` returns
  `status` (`submitted|streaming|ready|error`), `sendMessage({ text, files, metadata })`,
  `stop()`, `resumeStream()`, `regenerate()`, `addToolOutput()`, `addToolApprovalResponse({ id,
  approved, reason })`. `DefaultChatTransport({ api, headers: () => …, prepareSendMessagesRequest,
  prepareReconnectToStreamRequest })`. Part types: `text`, `reasoning`, `tool-<name>`
  (states `input-streaming|input-available|approval-requested|approval-responded|output-available|output-error|output-denied`),
  `dynamic-tool`, `source-url`, `source-document`, `file`, `data-<name>`, `step-start`.
  `stop()` only closes the connection: server cancellation needs its own endpoint. Resuming
  a stream needs server support (`GET …/stream`, 204 when none). `validateUIMessages` for
  persisted messages. `transcribe`/`generateSpeech` are stable.
- `@mastra/ai-sdk` 1.10.5: `chatRoute({ path, version: 'v7', sendReasoning, sendSources,
  heartbeatMs })`, `handleChatStream({ mastra, agentId, version: 'v7', params })`,
  `workflowRoute`, `toAISdkStream`, `toAISdkMessages(stored, { version: 'v7' })`,
  `withSseHeartbeat`. **Default version is `v5`: always pass `v7`.** With memory the client
  sends only the last message plus `memory: { thread, resource }`. Emits `data-workflow`,
  `data-tool-agent`, `data-tool-agent-step`, `tool-<key>`, `data-*` from `writer.custom`.
  Whether AI SDK v7 native approval parts round-trip through `chatRoute` is not documented
  (spike, Task 1).
- Mastra approvals: stream chunk `tool-call-approval`; `agent.approveToolCall({ runId,
  toolCallId })` / `declineToolCall({ …, reason })` return a continuation stream; built-in
  route `POST /api/agents/:id/send-tool-approval`, client-js `sendToolApproval`.
- Mastra durable agents (Beta, `@mastra/core/agent/durable`): `createDurableAgent({ agent })`,
  `stream()` → `{ output, runId }`, `observe(runId)` replays cached chunks after a disconnect;
  needs PubSub (EventEmitter in one process; `GoogleCloudPubSub` across instances).
  `abortThreadStream` / remote abort requests exist.
- AI Elements (registry `https://elements.ai-sdk.dev/api/registry/<name>.json`; 48 components):
  `conversation`, `message` (incl. `MessageResponse`, actions, branch), `prompt-input`
  (attachments, action menu, speech), `reasoning`, `tool`, `confirmation` (approval),
  `sources`, `inline-citation`, `task`, `plan`, `chain-of-thought`, `agent`, `attachments`,
  `speech-input`, `audio-player`, `transcription`, `shimmer`, `suggestion`, `context`
  (token usage), `code-block`, `artifact`, `queue`, `checkpoint`, `web-preview`, and more.
  The `ai-elements` CLI always runs `shadcn@latest`, so install with the pinned CLI:
  `pnpm dlx shadcn@4.21.0 add https://elements.ai-sdk.dev/api/registry/<name>.json`.
  Built on shadcn primitives (Radix under new-york) + `streamdown` 2.6.0, `use-stick-to-bottom`,
  `shiki`, `tokenlens`, `media-chrome`, `motion`, `nanoid`.

## 3. Architecture

```
Browser / Tauri webview
  @core/client widgets/chat  ──useChat(DefaultChatTransport)──►  web /v1/chat (Bearer)
                                                                   │ auth → validate → authorize
                                                                   │ conversations (Firestore)
                                                                   ▼
                                                  MastraGateway → Mastra chatRoute('/chat/:agentId', v7)
                                                                   │ FirebaseMastraAuth + context middleware
                                                                   ▼
                                                  supervisor agent (durable) → subagents/tools
```

- **Transport decision (umbrella §16.3):** Mastra stays private; the client never calls it.
  `/v1/chat` validates, authorizes, maintains conversation metadata, then pipes Mastra's UI
  message stream through unchanged (bytes, not re-encoded), adding `x-request-id`.
- **Stream protocol:** AI SDK UI message stream (SSE `data:` lines, header
  `x-vercel-ai-ui-message-stream: v1`) for chat — a documented deviation from `api.md` §14
  (named events `data|error|done`), because `useChat` requires it (D4-01). Workflow progress
  streams (SP5) keep `api.md` §14.
- Same widget in web and desktop (`@core/client`), rendered inside SP2's templates; the
  desktop uses the same `/v1` base URL (`VITE_API_URL`).

## 4. Backend

### 4.1 `conversations` context (`@core/services`)

Firestore `conversations/{autoId}` (id = Mastra `threadId`):
`tenantId`, `projectId`, `ownerId` (uid), `agentId` (default `assistant`), `title`,
`titleSource` (`auto|user`), `summary?`, `pinned`, `archivedAt?`, `deletedAt?` (soft
delete, hard delete by a job after 30 days, SP5), `lastMessageAt`, `messageCount`,
`activeRunId?`, `activeStreamStartedAt?`, `searchTokens` (normalized lowercase tokens of
title + summary, ≤ 50), `createdAt`, `updatedAt`. Contract `conversations.Conversation`
(pii `personal`: title and summary may mention people). Composite indexes:
`tenantId+ownerId+archivedAt+pinned+lastMessageAt`, `tenantId+ownerId+searchTokens(array)+lastMessageAt`.
Firestore Rules: clients may **read** their own conversations (`ownerId == uid` and
`access/{tenantId}_{uid}` exists) for realtime lists; writes are denied (D8).

Endpoints (permissions `core.conversation.<action>`; owner-only in v1):

| Method + path | Behaviour |
|---|---|
| `POST /v1/chat` | body `ChatRequest { conversationId?, agentId?, message: UIMessage (last only), trigger?: 'submit-message'|'regenerate-message', attachments?: fileId[] }`; creates the conversation when absent (returns id in header `x-conversation-id` and in the `start` message metadata); resolves attachments (§4.3); calls Mastra; stores `activeRunId`; returns the UI message stream |
| `GET /v1/chat/{conversationId}/stream` | resume: 204 when no active run; otherwise the replayed stream (§4.2) |
| `POST /v1/chat/{conversationId}/stop` | aborts the active run on Mastra, clears `activeRunId`; 204 |
| `POST /v1/chat/{conversationId}/tool-approvals` | `{ runId, toolCallId, approved, reason? }` → audit `AGENT_TOOL_CALL_APPROVED|DECLINED` → Mastra approve/decline → continuation stream (used when the native AI SDK approval path is not available, see §4.4) |
| `GET /v1/conversations` | cursor list: `?cursor&limit≤50&archived=false&pinned&q` (`q` → `searchTokens array-contains-any`) |
| `GET /v1/conversations/{id}` | metadata |
| `GET /v1/conversations/{id}/messages` | Mastra messages → `toAISdkMessages(…, { version: 'v7' })` → `validateUIMessages`; cursor by message index |
| `PATCH /v1/conversations/{id}` | `{ title?, pinned?, archived? }` |
| `DELETE /v1/conversations/{id}` | soft delete + Mastra thread delete (messages) + audit; 204 |
| `POST /v1/conversations/{id}/summary` | summarize with role `fast` (bounded to last 100 messages), store `summary`, refresh `searchTokens` |

Title: Mastra `generateTitle` (role `fast`) runs on the first turn; `/v1/chat` copies the
thread title into Firestore when `titleSource = auto` (on stream finish).

### 4.2 Streaming, stop and resume (D4-02)

Primary design: the supervisor is wrapped with `createDurableAgent`; `chatRoute` streams it;
`/v1/chat` stores `activeRunId`; resume calls Mastra `observe(runId)` through a custom
Mastra route `GET /chat/:agentId/runs/:runId/observe` (converted with `toAISdkStream`,
`version: 'v7'`), and stop calls a custom route `POST /chat/runs/:runId/abort` (remote abort
request). PubSub: EventEmitter locally (single process), `GoogleCloudPubSub` outside local
(SP3 Task 25) so any Mastra instance can observe. Heartbeats `withSseHeartbeat(…, 15000)`
keep proxies from closing idle streams; Mastra `server.timeout` 15 min (SP0).

**Spike first (Task 1)** with fake models: (a) durable agent + `chatRoute` v7 streaming,
(b) observe after a client disconnect replays missing chunks, (c) abort stops generation
and persists the partial answer, (d) approval chunks round-trip. If (a)–(c) fail on
`@mastra/core` 1.71.0, the fallback is recorded and implemented instead: plain agent
stream; resume returns 204 when the run is gone and the client reloads messages from
memory, showing "resposta interrompida" with a "regenerate" action; stop = client abort +
`abortSignal` propagated by `/v1` to Mastra (`c.req.raw.signal`).

### 4.3 Attachments and uploads

Uploads use SP3 `files` (`POST /v1/files` → Signed URL PUT → `onObjectFinalized`
validation). In chat:
- The prompt input uploads each file first (progress per file), then sends `attachments:
  [fileId]` with the message. `/v1/chat` accepts only `ready` files of the same tenant and
  owner, max 10 per message.
- Images and PDFs ≤ 10 MB become `file` parts (bytes inlined as data URLs by `/v1` from
  Storage — the model provider never receives a signed URL or a localhost URL).
- Video ≤ 200 MB: passed as a `file` part only when the `chat` role provider supports video
  (Google); otherwise the message gets a text note part "video attached, not viewable by the
  current model" and the agent can offer KB ingestion of its transcript (out of v1).
- Documents (txt, md, csv, pdf) above 10 MB, or when the user picks "add to knowledge base"
  in the attachment menu, go to `POST /v1/knowledge/sources { kind: 'file', fileId }` (SP3)
  and the chat shows a `data-ingest-progress` card.
- Every accepted attachment is referenced in the user message metadata
  (`attachments: [{ fileId, name, mediaType, sizeBytes }]`) so history shows them; the
  client previews through `GET /v1/files/{id}` (short read URL, 5 min).

### 4.4 Tool approval inline (D4-04)

- Mutation tools (SP3) require approval. Mastra emits `tool-call-approval`; with the AI SDK
  v7 bridge the client sees a tool part in `approval-requested` state.
- Client renders AI Elements `Confirmation` with the tool title, the permission, and the
  `preview` (before/after) from the tool's `ui` data part (`data-tool-preview`, written by
  `defineCoreTool` with `writer.custom` before approval).
- **Path A (preferred, if the spike proves it):** `addToolApprovalResponse({ id, approved,
  reason })` + `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`
  → `POST /v1/chat` carries the approval; `/v1` audits it and forwards; Mastra resumes.
- **Path B (fallback):** the Confirmation buttons call `POST /v1/chat/{id}/tool-approvals`;
  the response continuation stream is merged into the chat via `resumeStream()` semantics
  (the client re-attaches to the active run through `GET …/stream`).
- Four-eyes (`requiresApproval` permission): the tool returns `{ status: 'pending-approval',
  approvalId }`; the chat renders an `approval-pending` card linking to the approvals inbox
  (SP5). Every decision writes an audit event with `conversationId`, `toolCallId`,
  permission and actor.

### 4.5 Voice (D4-06)

- Push-to-talk: `features/chat-voice` records with `MediaRecorder` (`audio/webm;codecs=opus`,
  max 60 s, 5 MB), `POST /v1/voice/transcriptions` (multipart, the one binary exception of
  `api.md` §4) → gateway → Mastra `/voice/transcriptions` (SP3 Task 26) → `{ data: { text } }`;
  text goes into the prompt input for review (auto-send toggle, default off).
- TTS: "read aloud" action on assistant messages and an auto-read toggle;
  `POST /v1/voice/speech { text ≤ 4000, voice? }` → streamed `audio/mpeg` played with AI
  Elements `audio-player`.
- Realtime (optional, flag `chat.voice.realtime`, default off, experimental): `POST
  /v1/voice/realtime-sessions` mints a short-lived OpenAI Realtime client secret for model
  role `realtime` with the supervisor's instructions and **no tools**; the client connects
  over WebRTC. Disabled in fake mode (503 `FEATURE_UNAVAILABLE`). Tool use in realtime and
  Mastra `OpenAIRealtimeVoice` over WebSocket are out of v1 (Next route handlers do not
  terminate WebSockets).
- Permissions: `core.voice.use`; rate limit 30 transcriptions/min per user.

## 5. Client (`@core/client`, FSD)

```
src/
  shared/ui/ai/                AI Elements installed by the pinned shadcn CLI (Atomic: organisms/molecules
                               re-exported through shared/ui/ai/index.ts; copied code is owned here)
  shared/lib/markdown/         safe markdown (streamdown with link allowlist: http(s) only, rel=noopener, no raw HTML)
  shared/api/chat-transport.ts DefaultChatTransport factory (Bearer via auth port, API base URL, last message only)
  entities/conversation/       model (Conversation schema from contracts), api (list/get/patch/delete), ui (ConversationItem)
  entities/message/            ui/message-parts.tsx (part → component switch), lib/part-guards.ts
  features/chat-send/          prompt input + attachments + submit/stop
  features/chat-approval/      Confirmation wiring (path A/B)
  features/chat-upload/        upload queue (Signed URL PUT with progress, retry, cancel)
  features/chat-voice/         push-to-talk, TTS playback, realtime toggle
  features/chat-history/       search, rename, pin, archive, delete, summarize
  features/generative-ui/      registry: component id → { schema, Component }
  widgets/chat-panel/          Conversation + messages + input + status bar
  widgets/chat-history-sidebar/
  views/chat/                  page composition (web route `(app)/chat/[[...conversationId]]`, desktop route)
```

### 5.1 Rendering parts

| Part | Component |
|---|---|
| `text` | `MessageResponse` (streamdown, sanitized) with `InlineCitation` for `kb:` markers resolved against `source-document` parts |
| `reasoning` | `Reasoning` (collapsed by default; hidden entirely when the tenant disables reasoning display) |
| `tool-agent-*` / `data-tool-agent*` | `Agent` + `Task` (delegation: subagent name, prompt summary, steps), collapsible |
| `tool-<name>` | `Tool` (header, input, output; collapsed) unless the registry has a generative component for its `ui.component` |
| approval states | `Confirmation` (§4.4) |
| `data-workflow` | `Plan`/`Queue` steps with status (SP5 workflows started from chat) |
| `source-url` / `source-document` | `Sources` |
| `file` | `Attachments` preview / `Image` |
| `data-ingest-progress` | progress card |
| tripwire / error | inline `Alert` with reason code mapped to i18n (`chat.tripwire.<processorId>`) |

### 5.2 Generative UI registry (D4-03)

Registry entries are `ui-component` contracts in `@core/contracts` (`chat/ui/*.schema.ts`):

| Component id | Props (Zod) | Renders |
|---|---|---|
| `schema-form` | `{ contractId, commandId, mode, initialValues }` | SP2 `SchemaForm` from the contract schema; submit → `addToolOutput({ tool: 'renderForm', toolCallId, output: { submitted: values } })` then the agent calls the command (confirmation follows) |
| `data-table` | `{ columns: [{ key, labelKey?, type }], rows, truncated }` | SP2 `DataTable` (read-only, tabular nums) |
| `chart` | `{ kind: 'bar'|'line'|'area'|'pie', x, series: [{ key, label }], rows }` | shadcn chart (recharts 3.10.1) |
| `approval-diff` | `{ before, after, fields }` | before/after table inside Confirmation |
| `picker` | `{ options: [{ value, label }], multiple }` | select/radio; choice returned with `addToolOutput` |
| `approval-pending` | `{ approvalId, summary }` | card linking to the inbox (SP5) |

Tools declare `ui.component`; the client validates `props` with the same schema; invalid
or unknown → falls back to the generic `Tool` view (never throws). Modules can register
more components through `defineModule()` client manifests.

### 5.3 States

`status` + connectivity map to a status line (live region `aria-live="polite"`):
"respondendo" (`submitted|streaming`), "sem conexão" (`navigator.onLine === false` or
fetch error; retry button; queued input disabled), "sem certeza" (message metadata
`confidence: 'low'` from SP3 CitationGuard → badge on the message), "interrompido" (stop or
lost stream), `tripwire` (processor id → i18n reason). Stop button replaces submit while
streaming. Keyboard: Enter sends, Shift+Enter newline, Esc stops, push-to-talk on hold of
a button (and `Ctrl+Space` shortcut), all announced to screen readers; WCAG 2.2 AA; axe
clean in e2e.

### 5.4 i18n

All copy under `chat.*` keys in `pt-BR` (source), `en-US`, `es-419` (SP2 i18n package).
Dates relative with `Intl.RelativeTimeFormat` in the resolved time zone.

## 6. Security notes

- `/v1/chat` accepts only Bearer; the body is `z.strictObject`; only the last message is
  accepted and its parts are limited to `text` (≤ 16 000 chars) and approval responses;
  files come only by `fileId` (never client URLs).
- Model markdown is untrusted: no raw HTML, links http(s) only with a visible host, images
  only from our own read URLs.
- Rate limits: 20 chat turns/min per user, 5 concurrent streams per tenant (429 +
  `Retry-After`).
- Conversation ownership checked on every endpoint (IDOR); `resourceId` always
  `tenantId:uid` (SP3).

## 7. Decisions to record (next free numbers)

| Id | Decision |
|---|---|
| D4-01 | Chat uses the AI SDK UI message stream through `/v1/chat` (proxy to Mastra `chatRoute` v7); deviation from `api.md` §14 for chat only. |
| D4-02 | Resume/stop via durable agent `observe`/abort (spike-gated); fallback: reload from memory + client abort propagation. |
| D4-03 | Generative UI = typed `ui-component` contracts rendered from tool outputs; unknown → generic tool view. |
| D4-04 | Inline approvals: native AI SDK approval path when proven, else `/v1/chat/{id}/tool-approvals`; audit on every decision; four-eyes renders a pending card. |
| D4-05 | Conversation metadata in Firestore (`conversations`, id = thread id), messages only in Mastra memory; search by `searchTokens`; soft delete + 30-day purge. |
| D4-06 | Voice: push-to-talk via `/v1/voice/transcriptions`, TTS via `/v1/voice/speech`; realtime optional, WebRTC with ephemeral secret, no tools, off by default. |
| D4-07 | AI Elements installed from the registry URL with the pinned shadcn CLI into `shared/ui/ai`; code owned by the repo. |
| D4-08 | Attachments inlined by `/v1` from Storage as `file` parts (≤ 10 MB); video only for video-capable providers; large docs → KB ingestion. |

## 8. Mastra / AI SDK feature coverage (SP4 part)

| Feature | Decision |
|---|---|
| `@mastra/ai-sdk` `chatRoute` v7, `toAISdkMessages` v7, `withSseHeartbeat` | adopted |
| `handleChatStream` in Next | not adopted: Mastra private, `/v1` proxies `chatRoute` |
| `networkRoute` | not adopted (deprecated) |
| `workflowRoute` | SP5 (workflow progress in chat) |
| Durable agents `observe`, abort | adopted behind spike (Task 1) |
| Tool approvals (`approveToolCall`/`declineToolCall`) | adopted |
| Memory `generateTitle`, thread APIs (list/delete) | adopted |
| `@mastra/react` | not adopted: AI SDK `useChat` + AI Elements is the UI stack |
| AI SDK `useChat`, transport, `addToolOutput`, `addToolApprovalResponse`, `resumeStream` | adopted |
| AI SDK resumable streams with `resumable-stream` + Redis | not adopted: no Redis in the stack; Mastra durable observe instead |
| `experimental_useRealtime` / OpenAI Realtime WebRTC | optional flag (Task 12) |
| AI Elements components listed in §5.1 (+ `prompt-input`, `suggestion`, `context`, `shimmer`, `speech-input`, `audio-player`) | adopted |
| AI Elements `web-preview`, `sandbox`, `terminal`, `canvas`/workflow nodes, `persona`, `open-in-chat`, `model-selector` | not adopted in v1 (no use case in a generic core; `canvas` reconsidered for SP5 workflow view) |
