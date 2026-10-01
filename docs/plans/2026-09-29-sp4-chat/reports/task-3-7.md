# SP4 Tasks 3 to 7 report

Plan: `docs/plans/2026-09-29-sp4-chat.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-09-30.

## Commits

| Task | Commit | Message |
|---|---|---|
| 3 | `458b786` | `feat(contracts): add conversation and generative ui contracts` |
| 4 | `d7def11` | `feat(chat): add conversations context` |
| 5 | `43df059` | `feat(chat): add v1 chat streaming, stop, resume and approvals` |
| 6 | `0d0f8be` | `feat(chat): add conversation history endpoints` |
| 7 | `b00392e` | `feat(chat): add voice endpoints` |

Every commit was built and verified in the scratch worktree `wt-sp4-t3`, rebased onto main, and
replayed onto the main index with `update-index` (worktree blobs; the staged paths checked against
the commit's paths before each commit). See "Landing".

## Task 3: contracts

New contracts (`@core/contracts`):

- **`conversations/`**
  - `Conversation` (entity, `pii: personal`): the spec §4.1 fields. The id is a Firestore
    automatic id restricted to the thread-id alphabet (`[A-Za-z0-9_-]{1,128}`). `projectId` is
    nullable: the supervisor also runs at organization level.
  - `ChatRequest` (command, strict): `organizationId` (required when `conversationId` is absent),
    `projectId?`, `conversationId?`, `agentId?` (`assistant`), `message`, `trigger?`,
    `attachments?` (≤ 10 distinct file ids, user messages only). The message is either a user
    message whose parts are `text` only (≤ 16 000 characters, no `system` role, no file or URL
    parts), or an assistant message whose parts are approval responses only, with exactly the
    fields `@mastra/ai-sdk` reads (`type` `tool-*`/`dynamic-tool`, `toolCallId`,
    `state: approval-responded`, `approval { id, approved, reason? }`).
  - `ConversationPatch`, `ToolApprovalDecision`, `MessageMetadata` (`conversationId`, `agentId`,
    `confidence`, `attachments`).
  - Endpoints `chat.sendMessage|resumeStream|stopRun`, `conversations.list|get|update|delete|listMessages|summarize`.
    Chat and conversation endpoints are `auth: "user"`.
- **`chat/ui/`**: six `ui-component` props contracts (`schema-form`, `data-table`, `chart`,
  `approval-diff`, `picker`, `approval-pending`) and the registry `CHAT_UI_COMPONENTS`.
- **`voice/`**: `Transcription`, `SpeechRequest`, `RealtimeSession`; endpoints `voice.transcribe`
  (no `body`: the pipeline would read it as text and destroy the multipart),
  `voice.synthesize`, `voice.createRealtimeSession`.
- **Permissions** (`CHAT_PERMISSIONS`, spread into `CORE_PERMISSIONS`): `core.conversation.send|read|update|delete`
  and `core.voice.use`, member and above.
- **Audit**: actions `AGENT_TOOL_CALL_APPROVED|DECLINED`, `CONVERSATION_DELETED`,
  `VOICE_TRANSCRIBED|SYNTHESIZED`; metadata key `toolCallId`.
- **Error code** `FEATURE_UNAVAILABLE` (503), with messages in the three locales.
- **Rate limits** (services): `chat-turn` 20/min and `voice-call` 30/min per principal.

## Task 4: `conversations` context

New context `services/conversations` (decision 0033):

- **Domain.** `createConversation`; `isVisibleTo` (owner only, never a deleted one);
  `liveActiveRunId` (stale after 15 min, Mastra `server.timeout`); `applyConversationPatch` (a
  rename sets `titleSource: user`, archive stamps `archivedAt`); `endRunOf` (clears the run only
  when it is still the active one, counts the turn once, copies the automatic title while
  `titleSource` is `auto`). `buildSearchTokens` folds accents and case and keeps at most 50
  distinct words of title then summary; `queryTokens` caps a query at 30 (the
  `array-contains-any` limit).
- **Use cases.** start, get, list, update, delete (messages first through a callback, then soft
  delete; a streaming conversation answers `CONVERSATION_STREAMING`), active runs (`start`, `end`,
  `hasStreamCapacity`: 5 streams per tenant started in the last 15 min).
- **Firestore.** `conversations/{autoId}`, the id is the memory thread id. Timestamps are stored
  as `Timestamp`, plus storage-only `archived` (boolean mirror of `archivedAt`, so the list filters
  by equality) and `schemaVersion`. List order `pinned desc, lastMessageAt desc, id desc`, cursor
  `[pinned|lastMessageAt, id]`. `endRun` runs in a transaction.
- **Indexes** (`firestore.indexes.json`, and the index review test): `tenantId, ownerId, deletedAt,
  archived, pinned desc, lastMessageAt desc`; the same with `searchTokens` (contains); and
  `tenantId, activeStreamStartedAt` for the stream cap. The spec's index omitted `deletedAt`.
- **Rules.** The owner reads their own, non-deleted conversations of the active organization
  (`isMember`, so `access/{tenantId}_{uid}` must exist and not be revoked); every client write is
  denied.

## Task 5: `/v1/chat`

- **Gateway.** New port `ChatRuntimeGateway` and adapter `createMastraChatGateway`: raw calls to
  Mastra's custom routes outside the API prefix (`callRawRoute`: 204 is a success, other statuses
  are mapped without reading the body), `x-run-id` and `x-vercel-ai-ui-message-stream` passed back,
  the thread title through `client-js`.
- **`POST /v1/chat`** (`auth: user`, rate limit `chat-turn`): owner check (another member's
  conversation answers 404; a given `organizationId` must match the stored one) → authorize
  `core.conversation.send` at the conversation's project or organization → 5 streams per tenant
  (429 + `Retry-After: 5`) → for a user turn, attachments; for an approval response, the audit →
  the conversation is created on the first turn (its id is forwarded as `X-Conversation-Id`, so
  Mastra creates the thread under `tenantId:uid`) → Mastra `POST /chat/:agentId`. `activeRunId` is
  written before the stream is returned. The response is Mastra's bytes unchanged, with
  `x-conversation-id`, `x-request-id`, `x-vercel-ai-ui-message-stream: v1` and no caching.
- **End of a run.** `trackRunStream` passes the bytes through. When Mastra closes the stream
  (with or without `finish`) or fails it, the title is copied (best effort, 3 s) and the run is
  ended before the client sees the end. A client that disconnects only cancels the upstream read:
  the run goes on (the gateway gets no abort signal) and stays resumable.
- **Attachments.** Only `ready` `chat-attachment` files of the tenant uploaded by the caller (a
  file of another tenant or member answers like a missing one: 400 `VALIDATION_FAILED` with
  `attachments.<i>` details, before Mastra is called). Images, PDFs and text files ≤ 10 MB become
  `file` parts with a data URL; video and audio get a text note; larger documents a note that
  offers the knowledge base. The message metadata lists them.
- **Approvals (path A).** Each approval part must name its own tool call (`<runId>::<toolCallId>`).
  `AGENT_TOOL_CALL_APPROVED|DECLINED` is written per decision before forwarding (reason included);
  an audit failure answers 500.
- **`GET /v1/chat/{id}/stream`.** 204 without a live run. Otherwise Mastra observe: its 204 (run
  gone, or run by another instance) ends the run and answers 204; a replay is passed through.
- **`POST /v1/chat/{id}/stop`.** Mastra abort, then the run is ended; 204 also without a run.
- **Fix (a).** The context middleware takes `maxBodyBytes`; the `/chat/*` instance refuses a
  declared `Content-Length` above 140 MiB (413) and a body without one (411) before the tracing
  step parses it.
- **Fix (b).** Decision 0031 amendment: session affinity is the v1 choice (see concerns).

## Task 6: `/v1/conversations`

- **Mastra.** `GET /chat/:agentId/messages?page&perPage` reads the caller's thread (newest page
  first, chronological inside a page), converts it with `toAISdkMessages(…, { version: 'v7' })`
  and checks it with `safeValidateUIMessages`. `POST /chat/:agentId/summary` summarizes the last
  100 messages with the new hidden agent `conversation-summarizer` (role `fast`, no tools or
  memory, delegated guardrails: budget guard, token limit, secret filter), so the call is traced
  and billed; 409 when there is nothing to summarize. The summarizer is registered in Mastra and
  hidden from `/api/agents/*`.
- **`/v1/conversations`.** `GET` (`organizationId` required, `limit` ≤ 50, `cursor`, `archived`,
  `pinned`, `q`), `GET/PATCH/DELETE /{id}`, `GET /{id}/messages` (cursor = page index, the page is
  checked against `ChatUiMessageSchema`; a malformed upstream page is 502), `POST /{id}/summary`
  (stores the summary, refreshes the search tokens). Delete removes the memory thread first (a
  thread that never existed counts as removed; a failed delete is 502 and keeps the
  conversation), soft-deletes, and audits `CONVERSATION_DELETED`; a streaming conversation is 409.
  Read needs `core.conversation.read`, rename/pin/archive/summary `update`, delete `delete`.

## Task 7: `/v1/voice` and the voice follow-ups

- **Mastra side (fix (c), SP3 follow-ups #29 and #30).** A context middleware on `/voice/*`
  (body capped at 5 MiB) gives the voice routes the caller's context. `createVoiceGovernance`:
  `AI_VOICE_ENABLED` (agent env; unset = on in local only) gates every route with 503; the tenant
  budget is checked before the provider call (429 `BUDGET_EXCEEDED`, 503 when the check fails);
  after it, a `usage.llm_calls` row (`voice-transcription|voice-speech`, the role's provider and
  model, 0 tokens, cost `null`) and an audit entry `VOICE_TRANSCRIBED|SYNTHESIZED` are written.
  `CoreVoice` now exposes the provider and model of each role.
- **Realtime.** `POST /voice/realtime-sessions` mints an OpenAI client secret (60 s, supervisor
  instructions, `tools: []`) only with `AI_VOICE_REALTIME_ENABLED=true`, voice on, real mode and an
  OpenAI realtime model with a key; otherwise 503.
- **`/v1/voice`** (`auth: user`, `core.voice.use` at `?organizationId`, rate limit `voice-call`):
  `transcriptions` (multipart field `audio`, declared length checked before the form is parsed,
  type from the magic bytes: webm, ogg, mp4, wav), `speech` (streamed audio, `no-store`),
  `realtime-sessions` (201, `no-store`). Mastra's 503 maps to 503 `FEATURE_UNAVAILABLE`, its
  413/415/422 to 400 `VALIDATION_FAILED`.
- Decision 0034 amendment records the gate, the governance and the realtime metering gap.

## Verification

Fresh runs in the worktree. The full run was on the tree rebased onto `030afc9`; after the last
two rebases (onto `11201c3` and `598fe83`) the packages were typechecked again and the agents
runtime, chat and voice tests rerun.

```
pnpm -F @core/{contracts,services,agents,mastra,web} typecheck → clean
pnpm -F @core/{contracts,services,agents,web} lint → clean
pnpm -F @core/mastra lint → 1 error in workflow-hitl.emulator.test.ts (SP5's file, not this work)
pnpm -F @core/contracts test → 34 files, 389 passed; pnpm contracts:check → ok
pnpm -F @core/services test → 107 files, 764 passed
pnpm -F @core/agents test → 61 files, 477 passed, 1 skipped
pnpm -F @core/mastra test → 13 files, 65 passed
pnpm -F @core/web test → 5 files, 30 passed
firebase emulators:exec --config firebase.sp4t3.json (own ports: auth 29099, firestore 28080,
  storage 29199, hub 24400, logging 24500) --only auth,firestore,storage
  services conversations + files emulator tests → 4 files, 15 passed
    (repository: cursor pages, pinned first, archived filter, search, run start/end, stream
     count; rules: owner read, other member/tenant/deleted/anonymous denied, client writes denied)
  pnpm -F @core/mastra test:emulators → 6 files, 28 passed, including v1-chat.emulator.test.ts:
    /v1/chat streams a first turn (Firestore conversation created, activeRunId cleared on close,
      history lists it, messages come back as user + assistant UI messages, another member 404);
    a client that leaves keeps the run resumable, GET …/stream replays it, another member's stop
      is 404, stop 204 clears the run, a later resume is 204;
    an approval response is audited (AGENT_TOOL_CALL_APPROVED, conversation, toolCallId) and the
      command runs;
    rename (titleSource user), summary (fake fast model), delete (soft, thread gone, audited);
    /v1/voice transcribes on a voice-on Mastra, answers 503 FEATURE_UNAVAILABLE on a Mastra with
      AI_VOICE_ENABLED=false, and realtime answers 503 in fake mode
  pnpm -F @core/agents test:emulators → 1 file, 6 passed
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

New unit coverage: the contracts; search tokens; conversations use cases; `trackRunStream`;
the chat gateway; `/v1/chat` (401/400/403/404/429, attachments inlined, foreign attachments
refused before the runtime, video noted, approval audited with the decline reason, mismatched
approval refused, runtime failure, resume, stop); `/v1/conversations`; `/v1/voice` (magic bytes,
size, 401, 404, 503 pass-through, speech stream, realtime 503/201); the Mastra history routes;
the context middleware body cap (413/411); voice governance (ledger row, audit, flag off, budget
429/503, no context 403, realtime); the realtime minter; the agent env voice flags.

**TDD.** Red was observed first for the body cap (two failing tests) and for the runtime's
route, agent and middleware lists. Most other tests were written in the same step as their code
and passed on the first or second run (the first failures were a test helper's default
parameter, `Uint8Array` buffer typing and lint rules).

One e2e assertion failed once under load: the messages listed right after the stream ended
(memory stores the answer just after the stream closes). It now polls for up to 10 s; the
three full emulator runs after that passed.

## Landing

- Built in the scratch worktree `wt-sp4-t3`. Main moved several times (SP3 gate, SP1 follow-ups
  32/33, SP5 Tasks 0–3, the usage report), so the commits were rebased four times. Conflicts were
  in services `index.ts`, `apps/web/src/server/runtime-routes.ts`, `compose-agent-runtime.ts` and
  its test, and the contracts composition, permissions and catalog. Both sides were kept every
  time, and the catalog and OpenAPI were regenerated.
- Tasks 5, 6 and 7 were developed together, then split into three commits. I built the
  intermediate versions of the shared files: `runtime-routes.ts`, the services and agents index
  files, the chat gateway port, and `compose-agent-runtime.ts` and its test. Each intermediate
  tree was typechecked and its unit tests run before its commit.
- Each commit was replayed onto the main index with `update-index`, from the worktree blobs.
  Before each one I checked that the index held no other agent's entry and that the staged paths
  were exactly the commit's paths. A stale `index.lock` (20:27) blocked landing for a while, until
  the coordinator removed it.
- **Main's working tree.**
  - Paths without other agents' hunks were checked out.
  - Paths with uncommitted SP2 hunks got this work's hunk applied on top: contracts `index.ts`,
    `audit-action.schema.ts`, services `index.ts`, the catalog files, and `firestore.rules` (by
    hand).
  - `docs/catalog` and `openapi/v1.yaml` were regenerated in main with `pnpm contracts:catalog`.
  - In main, the services, agents and web typechecks are clean and the contracts tests pass.
- **Incident during the Task 3 landing.**
  - To re-apply SP2's hunks, I first overwrote the working copies of `contracts/src/composition.ts`
    and the three `i18n/.../errors.json` with HEAD. Only then did I check SP2's patch, and it did
    not apply.
  - I restored SP2's lines. Composition, `en-US` and `pt-BR` came from the SP2 diffs I had printed
    just before. `es-419` came from `scratchpad/sp2-backup/sp2-snapshot-latest.patch` (19:06).
  - The restored hunks match that snapshot. The SP2 owner should still check those four files.
  - Nothing of SP2 was committed.

## Deviations and concerns

1. **Multiple Mastra instances (fix (b)).**
   - Decision 0031 records Cloud Run session affinity as the v1 choice.
   - The replay cache and the run owners live in the process that runs the stream. On another
     instance, resume answers 204, stop is a no-op and an approval answers 403. All three fail
     closed: none of them ever acts on another member's run.
   - The gateway does not forward an affinity cookie yet. Until a follow-up adds it, or adds a
     shared run-owner store in Mastra's Postgres storage plus a replay that does not depend on the
     process, **deploy the chat with one Mastra instance**.
   - A shared store did not fit in these tasks: the run owners are synchronous, and four Task 2
     modules use them.
   - **Please add follow-up rows** (`follow-ups.md` has other agents' uncommitted rows):
     (a) shared chat run store or affinity cookie; (b) realtime voice metering; (c) a per-tenant
     voice flag (SP5 feature flags).
2. **Voice (fix (c)).**
   - The platform flag is off outside local. Compliance (#30) still has to clear sending audio
     before it is enabled.
   - Ledger rows have 0 tokens and a `null` cost (audio is not priced). The budget therefore
     counts calls, not money.
   - Realtime audio flows between the browser and the provider and is not metered at all.
   - There is no per-tenant switch yet.
3. **The approval audit has no permission and may name the delegation tool.**
   - `toolId` is the sanitized name of the approved part. When the supervisor delegated a command,
     it is `agent-action`, not the command.
   - The permission is not in this entry, because `/v1` only has the client's copy of the part.
     `AGENT_TOOL_EXECUTED` carries it when the call runs.
4. **The client must send minimal approval parts.**
   - `ChatRequest` is strict: an assistant message may hold only approval responses with `type`,
     `toolCallId`, `toolName?`, `state` and `approval`.
   - `useChat` keeps `input`, text and reasoning parts on the message. The Task 8 transport must
     reduce the last message in `prepareSendMessagesRequest`.
5. **Video.** `/v1` cannot know whether the chat provider supports video. In v1, every video and
   audio attachment becomes a text note.
6. **Title copy** relies on Mastra memory `generateTitle`. The e2e harness runs without a vector
   store, so only unit tests cover the copied title.
7. **`messageCount` is approximate:** +2 each time a run ends, so an approval continuation counts
   again.
8. **Path B approvals** (`/v1/chat/{id}/tool-approvals`, `tool-approvals-route-handler.ts`) are not
   built, per decision 0032. The `ToolApprovalDecision` contract describes the audited decision.
9. **Commit split.** The Task 5 commit already contains the chat gateway's history methods
   (`listMessages`, `summarize`, `deleteThread`), which Task 6 uses.
10. **New error code.**
    - `FEATURE_UNAVAILABLE` was added to `CORE_ERROR_CODES`, with messages in the three locales.
    - The `errors.json` files carry uncommitted SP2 hunks. The committed blobs are HEAD plus this
      line.
11. **SP5 lint.** `pnpm -F @core/mastra lint` reports one error in SP5's
    `workflow-hitl.emulator.test.ts`, which another agent landed.
