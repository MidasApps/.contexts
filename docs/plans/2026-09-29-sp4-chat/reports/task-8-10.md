# SP4 Tasks 8 to 10 report

Plan: `docs/plans/2026-09-29-sp4-chat.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-10-01.

## Commits

| Task | Commit | Message |
|---|---|---|
| 8 | `0a9339a` | `feat(client): add ai elements, safe markdown and chat transport` |
| 9 | `e19f4b4` | `feat(chat): add chat panel with streaming states` |
| 10 | `f0004d1` | **inside another agent's commit** `feat(agents): derive mutation tools from command contracts` (see "Landing") |
| fix | `0d617b7` | `fix(chat): keep shimmer text at aa contrast` |

## Task 8: AI Elements, safe markdown, chat transport

- **AI Elements** (`packages/client/src/shared/ui/ai/`, exported as `@core/client/shared/ui/ai`). The pinned CLI
  (`pnpm dlx shadcn@4.21.0 add https://elements.ai-sdk.dev/api/registry/<name>.json`) ran in a scratch copy for
  the 20 components of the plan. It wrote 5 893 lines, 21 shadcn primitives and asked for 19 dependencies. The
  20 files in the repo are **ports** of that output, not copies: the Atomic kit instead of a second set of
  primitives, design tokens, `chat.elements` messages or required label props instead of English strings, the
  500-line rule and WCAG 2.2 AA. Decision 0035 (amendment) lists what each upstream dependency became.
- **Safe markdown** (`shared/lib/markdown/`). `resolveSafeLink`: absolute http(s) only, no credentials, punycode
  host shown. `SafeMarkdown`: streamdown with `skipHtml` and no `rehype-raw`; links open in a new tab with
  `rel="noopener noreferrer nofollow"` and the host; images are not loaded (alt text stays); `#cite-<n>` is the
  one fragment kept, for citations.
- **Chat transport** (`shared/api/chat-transport.ts`). `DefaultChatTransport` over a `fetch` that: asks for the
  Bearer token per request; sends a ULID `x-request-id`; retries once after a 401 with a forced refresh; reads
  `x-conversation-id`; maps error envelopes to `ApiError`. Body: `organizationId` (+ `projectId`, `agentId`)
  only while there is no conversation, then `conversationId`; the last user message with text parts only; or
  the assistant message reduced to its answered approval parts with exactly
  `type, toolCallId, toolName?, state, approval`; `attachments` from `sendMessage(…, { body })`. Resume is
  `GET /v1/chat/{id}/stream` (204 → `null`; no request without a conversation).
- **Wiring.** `ApiProvider` takes `connection` (`baseUrl`, `getIdToken`, `fetch`) and `useApiConnection()` reads
  it; `createClientApp` and the test harness pass it. New namespace `chat` in `@core/i18n` (three locales),
  added to `RESERVED_MODULE_IDS`.

Dependencies (`npm view`, 2026-10-01):

| Package | Version | Published | Note |
|---|---|---|---|
| `@ai-sdk/react` | 4.0.125 | 2026-09-28 | Pins `ai` 7.0.122 exactly, the catalog's version. Latest is 4.0.129, which needs `ai` 7.0.126: it moves with the `ai` train. Apache-2.0. Brings `@ai-sdk/mcp` 2.0.62 (2026-09-28), `swr` 2.5.1, `throttleit` 2.1.0 |
| `streamdown` | 2.6.0 | 2026-08-24 | The plan's pin. 2.7.0 was published 2026-09-30 (one day old). Apache-2.0 |
| `use-stick-to-bottom` | 1.1.6 | 2026-06-04 | MIT |
| `ai` | 7.0.122 | (catalog) | Now also a dependency of `@core/client` |
| `recharts` | 3.10.1 | (catalog, SP5) | Used by the `chart` component |

No `minimumReleaseAgeExclude` or `allowBuilds` entry was needed: pnpm installed all of them under its own
release-age window (`pnpm config get minimumReleaseAge` is unset in this workspace).

## Task 9: chat panel

- **`entities/message`.**
  - `lib/part-guards.ts`: lenient readers of the stream's parts (tool parts, delegation, tripwire, tool preview,
    approval request, generative UI, pending approval, sources, metadata). They answer `null` for a shape they
    do not know; nothing is cast.
  - `lib/citation-markers.ts`: `[kb:<uuid>#<n>]` → numbered `#cite-<n>` links; numbers continue across text
    parts; a marker cut by streaming is hidden.
  - `lib/ui-submission.ts`: the user turn that carries a submitted form or a picker choice (Task 10).
  - `ui/message-parts.tsx` and `ui/chat-message.tsx`: the part → component map of spec §5.1, with a `renderTool`
    slot for the features layer.
- **`features/chat-send`.** `ChatInput`: Enter sends, Shift+Enter breaks the line, Esc stops; IME composition
  safe; 16 000-character limit with a counter from 90 % and a reason when over; offline keeps the draft.
- **`widgets/chat-panel`.**
  - `model/use-chat-session.ts`: `useChat` + the transport; stop also calls `POST /v1/chat/{id}/stop`; resume on
    mount; `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`; one `ChatPhase`.
  - `model/use-conversation-thread.ts`: loads a stored conversation (metadata + newest page of messages).
  - `ui/status-line.tsx`: one polite live region, always mounted; an error is an `alert`.
  - `ui/chat-thread.tsx`, `ui/chat-panel.tsx`: log, status line, composer, header with "Nova conversa".

States and where they are covered (`chat-panel.test.tsx` unless noted; every state has an axe check):

| State | Behaviour |
|---|---|
| Empty | Greeting and four generic suggestion cards; a card sends its prompt |
| Connecting | "Conectando…" plus a pending assistant bubble until the first chunk |
| Streaming | "Respondendo…"; send becomes stop; the log is `role="log"` with `aria-live="off"` |
| Finished | "Resposta concluída." in the live region only; copy and regenerate actions |
| Reasoning | Collapsed; hidden with `showReasoning={false}` (`chat-message.test.tsx`) |
| Tool call | Collapsed card with the state in words (`chat-message.test.tsx`) |
| Delegation | Agent card "Delegado para Agente de …" with request, steps and result (`chat-message.test.tsx`) |
| Stopped | Esc (composer or anywhere in the thread) or the stop button; partial answer kept, "Interrompido" |
| Lost stream | "Conexão perdida…" with retry; a stored conversation is reloaded and resumed |
| Offline | "Sem conexão."; the draft stays, sending is blocked; a failed send offers retry |
| Error | Alert with `errors.<code>` copy, the request reference and retry; never the raw message |
| Tripwire | Warning alert with the reason of the processor, default copy for an unknown one |
| "Sem certeza" | Badge and hint when `metadata.confidence === "low"`, once the answer is complete |
| Resumed after reload | History loads; with `activeRunId` the thread re-attaches ("Retomando resposta…") |
| History | Loading skeleton, not found (404), error with reference and retry, "load earlier" |

## Task 10: generative UI and inline approvals

- **`features/generative-ui`.** `createUiRegistry` + `resolveGenerativeUi` (props validated with the schemas of
  `CHAT_UI_COMPONENTS`); `GenerativePart` with an error boundary; six components: `schema-form` (SP2
  `SchemaForm`), `data-table` (SP2 `DataTable`, typed cells), `chart` (recharts, lazy, data repeated in a
  table), `picker`, `approval-diff`, `approval-pending`. Unknown id, invalid props, a missing contract or a
  failing component → the generic tool view and one `GenerativeUiError` report without props.
- **`features/chat-approval`.** `ToolConfirmation` (AI Elements `Confirmation`): summary, permission,
  arguments, before/after; approve, or decline with an optional reason; pending and result states; the decision
  is sent once.
- **`widgets/chat-panel/ui/chat-tool-part.tsx`** composes both in the tool-part slot. It reads generative UI
  from the part's output and from `subAgentToolResults`.
- **Support.** `defineClientModule({ contracts })` and `ModuleRegistry.contracts()`; `ErrorReporterProvider` /
  `useReportError` (fed by `adapters.reportError`); `ChatPanel` props `uiComponents`, `contracts`,
  `approvalHref`, `can`, `defaultCurrency`.

## Verification (fresh, 2026-10-01)

```
pnpm -F @core/client test        → 197 files, 897 passed (second full run)
  first full run of the day: 8 files failed with 5 s timeouts (app-layout, command-palette and six
  SP2/SP5 views) while other agents ran their suites; the same 8 files alone → 8 files, 53 passed
  Task 8  (markdown, transport, ai elements)                  → 4 files, 51 passed
  Task 9  (message entity, chat input, chat panel, status)    → 6 files, 77 passed
  Task 10 (generative ui, approval, tools, module contracts)  → 5 files, 48 passed
pnpm -F @core/client typecheck   → clean
pnpm -F @core/client lint        → clean
eslint --no-ignore on shared/lib/markdown, shared/lib/errors/error-reporter.tsx, entities/message/lib → clean
pnpm -F @core/web typecheck, pnpm -F @core/desktop typecheck → clean
pnpm i18n:check                  → ok (10 namespaces, 30 catalogs)
pnpm -F @core/i18n test          → 9 files, 51 passed
pnpm -F @core/contracts test     → 36 files, 411 passed; pnpm contracts:check → ok
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

**TDD.** The tests of each unit were written before or with it; several passed on their first run. Red that
was observed:

- `SafeMarkdown` rendered `**bold**` as a `span` (streamdown's default); it now maps to `strong`/`em`.
- The schema form fell back to the generic view in its first test: the fixture's messages were not keyed by
  locale, the label lookup threw and the error boundary caught it. This is the "component fails" path.
- The first `chart` test timed out on the lazy import of recharts.
- Lint: a ref read during render in `use-chat-session` (now a small link object), a heading without content.

Because the panel tests passed on their first run, they were checked by mutation: without the stop call, the
resuming phase, the lost outcome, the Esc handler, the nested UI scan, the diff or the decline reason, the
matching tests fail (7 mutations, each caught).

## Landing

- Tasks 8 and 9 and the fix were committed with only their own paths. The lockfile was staged as a patch with
  this work's hunks only: `pnpm install` had also resolved another agent's uncommitted `package.json` changes
  (`apps/mastra`, `modules/example`).
- **Task 10 is inside `f0004d1`.** Another agent's plain `git commit` ran between this task's `git add` and its
  `git commit -- <paths>`, and took the staged Task 10 files with it. The files are complete and unchanged; the
  planned message `feat(chat): add generative ui registry and inline approvals` does not exist. History was not
  rewritten (shared branch). Later commits used `git commit -- <paths>` on a clean index.

## Deviations

1. **A form or picker answer is a user turn, not `addToolOutput`** (decision 0032 amendment).
   `catalog.renderForm` runs on the server inside the data subagent: its result is in `subAgentToolResults`,
   so there is no part to answer, and `ChatRequest` accepts only text in a user message. The plan's test
   "submit calls `addToolOutput`" became "submit sends the contract-validated values as the next turn".
2. **Delegation** is rendered from `tool-agent-<id>` parts and their `subAgentToolResults`, as the Task 1 spike
   found; `data-tool-agent*` parts are ignored.
3. **AI Elements are ports.** Not adopted: shiki, the streamdown plugins, motion, media-chrome, tokenlens,
   embla, nanoid (decision 0035). Code blocks have no syntax highlighting.
4. **`messageMetadataSchema` is not given to `useChat`.** The citation guard writes `confidence: "grounded"`;
   `MessageMetadataSchema` allows `low | normal`. A strict schema would fail the stream. The client reads
   `confidence === "low"` leniently.
5. **Approvals inbox link** defaults to a plain `/approvals/{approvalId}` href: the route map has no approvals
   route. `ChatPanel` takes `approvalHref`.
6. **i18n path.** Catalogs are in `packages/i18n/src/messages/<locale>/chat.json` (the plan said
   `packages/i18n/messages/`). All keys of Tasks 8–10 are in the Task 8 and 9 commits.
7. **Extra files** beyond the plan's lists: `chat-message.tsx`, `ui-submission.ts`, `chat-thread.tsx`,
   `chat-tool-part.tsx`, `use-conversation-thread.ts`, `generative-ui-context.tsx`, `core-components.ts`,
   `error-reporter.tsx`, the fake transport and the note contract fixture.

## Concerns

1. **Task 15 blocker: the fake action agent cannot run a submitted form.** The submission turn starts with
   `[ui:schema-form] The user submitted the form of command <id> (create). Confirm and run that command with
   exactly these values.` followed by a JSON block. "Confirm" makes the fake supervisor delegate to
   `agent-action`, but `runCommandRule` (`fake-scenarios.ts`) only fires on `named "<text>"` and sends
   `{ name }`; `example.CreateNoteCommand` takes `title`. The fake needs a rule that reads the JSON block of a
   `[ui:schema-form]` turn and calls `command.<commandId>` with `values`.
2. **The example module does not pass its contracts to the client.** Without
   `defineClientModule({ contracts: EXAMPLE_CONTRACTS })` and `ChatPanel contracts={modules.contracts()}`
   (Task 13), `renderForm` for a note shows the generic tool view.
3. **`confidence` enum mismatch** (deviation 4). It is also not verified that the live stream carries the
   metadata; the badge may only appear after a reload. The contracts owner should align the enum.
4. **Tripwire copy.** Keys exist for `tenant-budget-guard`, `tenant-pii-detector`,
   `system-prompt-scrubber-result`, `prompt-injection-detector` and `moderation`. The last two match no
   processor id in `packages/agents` today; any other id shows the default copy.
5. **No approvals route** (deviation 5). SP5 should add it to the route map and the apps should pass
   `approvalHref`.
6. **ESLint ignores `**/lib/**`** (`packages/config/eslint/index.js`, meant for build output). So
   `shared/lib/**` and `entities/*/lib/**` of the client are never linted by `pnpm lint`. The new files there
   were linted with `--no-ignore`.
7. **Resume and stop depend on one Mastra instance** (decision 0031). On another instance the client gets 204
   and shows the stored messages; a lost stream then ends as the partial answer plus "Tentar novamente".
8. **Not verified in a browser.** jsdom has no layout: scroll anchoring, the scroll-to-bottom chip, the
   container-query grid, contrast and the `animate-shimmer` keyframes need the Playwright run of Task 14.
9. **Chat is not mounted yet.** `ChatPanel` is exported; the right-panel slot, the chat view, navigation and
   `can` / `defaultCurrency` / `approvalHref` wiring are Task 13.
10. **Loading earlier messages** prepends them without restoring the scroll position.
11. **Dependency follow-ups.** `@ai-sdk/react` 4.0.129 with the `ai` 7.0.126 train; `streamdown` 2.7.0 once it
    ages.
12. **The commit of Task 10** (see "Landing").

Follow-ups recorded in `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`: #40 (concern 1), #41
(concerns 2 and 5), #42 (concern 3), #43 (concern 6), #44 (concern 11).
