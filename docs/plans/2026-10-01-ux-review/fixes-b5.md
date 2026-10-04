# B5: Chat continuity and approvals fixes

Batch B5 of `consolidated.md`: U-09, U-10, U-11, U-37, U-38, U-41, U-44, U-45, U-68. Every finding
still held when re-checked on `140151d3` (none was already fixed). Decision:
`app/docs/decisions/0070-right-panel-closes-itself-and-keeps-its-place.md`. Paths are relative to
`app/packages/client/src/` unless they start with `app/`.

**Pre-check asked by the batch (C-03):** `/v1/chat` does not refuse a user turn sent past an
unanswered approval. `send-chat-message.ts` authorizes, checks the stream cap and forwards the
message to Mastra, with no look at pending tool calls. So the client must hold the turn. A server
guard is follow-up row 104.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-38 load earlier fails silently | C-05 | fixed | `fix(chat): say when earlier messages fail to load` | `widgets/chat-panel/ui/chat-panel.history.test.tsx` "says when earlier messages could not be loaded and loads them on the next try" |
| U-37 knowledge uploads block send, stale chip | C-04 | fixed | `fix(chat): stop knowledge uploads from blocking the message` | `features/chat-upload/model/upload-queue.test.ts` "never holds the message for a knowledge file still on its way…" and the knowledge-source case (leaves the composer on `take`); `widgets/chat-panel/ui/chat-panel.upload.test.tsx` "adds a document to the knowledge base…" (sends while it uploads, chip gone after sending) |
| U-11 send while an approval waits, stranded card | C-03 | fixed | `fix(chat): never strand a turn that waits for the member`; `fix(chat): hold forms and choices while an approval waits` | `widgets/chat-panel/ui/chat-panel.turns.test.tsx` "holds the next message while an approval waits, and says why", "does not let a choice in the same answer go past the approval", "says an approval the conversation moved past is no longer active…" |
| U-45 older forms and pickers | C-15 | fixed | `fix(chat): never strand a turn that waits for the member` | `chat-panel.turns.test.tsx` "shows the choice a picker got in the next turn", "says a picker nobody answered is no longer active", "says a form of an older turn was sent, or is no longer active…" |
| U-09 side panel loses its conversation | C-01 | fixed | `feat(client): let the right panel close itself and keep its place`; `fix(chat): keep the side panel's conversation and its close in reach` | `views/chat/ui/chat-view.test.tsx` "keeps the conversation it started when it is closed and reopened, and links to it on the chat page"; `app-shell/shell-ui-store.test.ts` "remembers what the right panel holds per key, in memory only", "resets to the initial state" |
| U-10 sheet X over "Nova conversa" | C-02 | fixed | same two commits | `shared/ui/templates/AppShellTemplate/AppShellTemplate.test.tsx` "uses a sheet for the right panel on compact screens" (no corner close); `widgets/chat-history-sidebar/ui/chat-history-sidebar.test.tsx` "offers its own close button only when the host passes one"; `chat-view.test.tsx` (panel close button) |
| U-68 two "Nova conversa" behave differently | P-03 | fixed | `fix(chat): keep the side panel's conversation and its close in reach` | `chat-view.test.tsx` "follows a history link … and 'new conversation' back to an empty chat" (the composer takes the focus) |
| U-44 chat height ignores the banners | C-14 | fixed | `fix(chat): fit the chat page under the shell banners` | `shared/lib/media/use-element-height.test.tsx`; `app-shell/app-layout.test.tsx` "tells the page how tall the banners above it are…" |
| U-41 open conversation unnamed, three names | C-11, P-06 | fixed | `fix(chat): name the open conversation and the feature once`; `test(chat): follow the chat navigation item under its new name` | `chat-panel.history.test.tsx` "names the open conversation in its header…", "calls a conversation without a title untitled", "shows the title the server generates once the first answer of a new conversation ends"; `chat-view.test.tsx` (h1, region, nav link) |

The ADR was written as 0048, renumbered to 0049 because B1 landed its own 0048 first, and to
0070 when the batch was integrated, because the console review had taken 0049.

## What changed

- **Approvals (U-11).** `ChatSession.awaitingApproval` comes straight from the last message: a tool
  part in `approval-requested`. It does not use `phase`, which offline or stop would override. While
  it is true the composer is blocked with "Aprove ou recuse a ação acima antes de continuar.". The
  draft is kept, voice auto-send goes through the same check, and forms or pickers in the same
  answer are not interactive. A card the conversation moved past (`stale`: not the latest message)
  hides its buttons and says "Esta aprovação não está mais ativa. A ação não foi executada.". That is
  true because the tool part never left `approval-requested`.
- **Generative UI of older turns (U-45).** `GenerativeComponentProps` gains two optional fields,
  `stale` and `answer`. `answer` is the `parseUiSubmission` of the next user message. Module
  components need no change. The picker shows the chosen options and "Escolha enviada."; the form
  shows "Formulário enviado.". Unanswered ones say they are no longer active. The rule uses `stale`
  and not `!interactive`, so the note never flashes on the latest turn while it streams.
- **Side panel (U-09, U-10).** `ShellSlots.rightPanel` receives `{ onClose }`. The shell UI store has
  an in-memory `rightPanel` map (not persisted, cleared by `reset`). The chat keeps its conversation
  id there per `organizationId:projectId`. Reopening loads the stored thread, and a run still
  streaming re-attaches through the existing resume path (`chat-streaming.spec.ts` covers resume
  after a reload). Once the panel has a conversation, its header offers "Abrir na página do
  assistente" (a route link that also closes the panel). Both sheets drop the kit's corner X. The
  panel and the history sidebar put a named close button at the end of their headers. The panel's
  no-project state has one too.
- **"Nova conversa" (U-68).** When the URL owner moves to a new conversation, the panel builds the
  thread `fresh`, so the history link focuses the composer like the header button does.
- **Height (U-44).** `AppLayout` measures its banners (`useElementHeight`, `ResizeObserver`; the
  wrapper is `flow-root` so their margins count). It publishes the height as
  `--shell-banners-height` on the content wrapper. The chat page subtracts it in its `calc`. The
  class compiles to `calc(100svh - 6.5rem - var(--shell-banners-height,0px))`, checked with the
  Tailwind 4.3.3 compiler.
- **Title and naming (U-41).** The panel `section` is labelled "Assistente". Its `h2` names the
  conversation: "Nova conversa", the title, "Conversa sem título", or a skeleton while it loads. The
  title comes from `conversationQuery` (entity `conversation`), keyed under the conversation-lists
  key, so rename, pin, delete and the chat page's history refresh also refresh it. The panel
  invalidates it when a turn settles: the server copies the generated title when the run ends,
  before the stream closes (`chat-http.ts`). The h1, the navigation item and the page title now say
  Assistente / Assistant / Asistente, like the topbar toggle. The e2e journeys follow the new link
  name. They were edited but not run here; the final verifier runs Playwright.
- **Upload queue (U-37).** `hasUploadsInFlight` counts chat attachments only. `take()` also drops
  finished knowledge files. Their chip now says the document was sent and that indexing continues in
  the background.
- **Load earlier (U-38).** `useOlderMessages` exposes `failed`. The thread shows "Não foi possível
  carregar as mensagens anteriores. Tente de novo." under the button, which stays as the retry. The
  empty `catch {}` is gone.
- **Test seam.** `shared/testing/fake-api.ts` can answer with a raw text body and headers
  (`chatStream`). App-level tests can now drive `/v1/chat` through the real transport, including
  the `x-conversation-id` header.

## Deferred

None of the nine findings. New follow-ups found while fixing:

- Row 104: the server should refuse a user turn while an approval waits.
- Row 105: knowledge uploads started from the chat are cancelled when the composer unmounts. This
  was already true before B5; U-37 makes it easier to hit.
