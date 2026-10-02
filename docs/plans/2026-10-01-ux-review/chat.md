# UX review — chat experience

Scope: `views/chat`, `widgets/chat-panel`, `widgets/chat-history-sidebar`, `features/chat-*`
(send, upload, voice, history, approval, agent picker), `features/generative-ui`,
`entities/message`, `entities/conversation`, `shared/ui/ai`, plus `shared/lib/markdown` (the
answer renderer) and the shell's right-panel slot that mounts the chat. All paths below are under
`app/packages/client/src/` unless stated otherwise.

## Method and limits

- Read-only review by code reading of every file in scope and its colocated tests.
- Component tests of the scope were run:
  `pnpm -C app/packages/client exec vitest run src/views/chat src/widgets/chat-panel src/widgets/chat-history-sidebar src/features/chat-* src/features/generative-ui src/entities/message src/shared/ui/ai src/shared/lib/markdown --maxWorkers=2`
  → **21 files, 231 tests passed**.
- No browser was started and no screenshots were taken (machine memory). Each finding is tagged
  **[seen]** (the behaviour follows directly from the code cited) or **[inferred]** (a layout or
  runtime consequence deduced from CSS/flow; worth one screenshot or e2e to confirm).
- Not verified by code reading, so not claimed here: rendered contrast ratios (the code only shows
  token use and one axe-driven fix), real layouts at 360/768/1280 px, dark theme rendering, and
  reduced-motion beyond the `motion-reduce:` classes and the global `prefers-reduced-motion` rule
  in `shared/ui/styles/globals.css:241`.
- i18n: `chat.json` has the same 257 keys in pt-BR, en-US and es-419 (scripted diff); plurals use
  ICU `plural`; no hard-coded copy, colour literals or literal `aria-label`s were found in scope.

## Summary

| Screen / block / component | States covered (seen in code + tests) | Missing / weak | Verdict |
|---|---|---|---|
| `ChatView` (`/o/:org/p/:project/chat/:id?`) | permissions loading, error+retry, forbidden, not-found params; URL follows new conversation (replace), deleted active → leaves | height calc ignores banners (C-14); no conversation title on compact (C-11) | Good |
| History sheet (compact) | sheet with sr-only title; closes on navigate | close button over "Nova conversa" (C-02) | Needs fix |
| `ChatPanel` + header | new vs stored thread, agent picker while new, agent name once fixed, new conversation | title of the open conversation never shown (C-11) | Good |
| `StoredThread` | loading skeleton, error + requestId + retry, not found | not-found has no primary action (P-07) | Good |
| `ChatThread` / log | empty state + suggestions, load earlier (+ scroll anchor), pending-answer shimmer, Esc stops, focus back to composer, scroll-to-bottom chip | load-earlier failure silent (C-05); no virtualization for very long threads | Good |
| `StatusLine` | connecting, resuming, responding, finished (announced), awaiting approval, stopped, lost + retry, offline (+retry if failed), error alert with code→message, reference, retry | offline said twice (P-04); partial answer on error not marked (P-13) | Good |
| `ChatComposer` / `ChatInput` / `PromptInput` | Enter/Shift+Enter/IME, Esc stop, send↔stop single button, disabled until sendable, counter near limit, too-long reason, offline reason, uploads-blocking reason, draft kept | sendable while an approval waits (C-03); placeholder = button name (P-05) | Good |
| `AttachMenu` / `AttachmentChips` / upload queue | per-file states in words, % progress, preview, cancel/remove, retry, server refusal reasons, per-message limit, live announcements | knowledge uploads block sending and never leave the composer (C-04); no paste/drop (P-12) | Needs fix |
| `ComposerVoice` / `PushToTalkButton` / `ReadAloudAction` | hold or toggle, Esc cancel, requesting/recording/transcribing/inserted in words, problems (denied, unsupported, too large, empty, unavailable, failed), auto-send/auto-read options, read-aloud loading/error, native player | realtime error invisible (C-12); global Ctrl+Space (C-13); no elapsed time (P-10) | Good |
| `ChatToolPart` (tool slot) | generic card, generative UI, nested subagent UI, approval card, interactive only on latest settled turn | — | Good |
| `ToolConfirmation` | request, permission, diff or "no preview", args, approve, two-step decline with reason, pending labels, lock against double answer, focus to result, executed / failed / declined outcomes | raw permission code (C-07); disabled with no reason when stranded (C-03) | Good |
| `GenerativePart` | registry lookup, invalid props → fallback + report, error boundary, Suspense skeleton | skeleton height ≠ chart height (P-09) | Good |
| `SchemaFormPart` | contract missing → fallback, submit, submitted status, non-interactive | raw commandId heading (C-08); stale form disappears silently (C-15) | Needs fix |
| `PickerPart` | single/multi, required message per group, pending, submitted, locked | stale/answered picker after reload shows no answer (C-15) | Good |
| `DataTablePart` | number/boolean/money/date formatting by locale, empty, truncated note | header falls back to raw key (C-08) | Good |
| `ChartPart` | bar/line/area/pie, token colours, legend in words, sr-only data table, locale numbers | sr-only header uses raw `x` key (C-08) | Good |
| `ApprovalPendingPart` (four eyes) | summary, link to inbox | raw approvalId shown (C-08); plain `<a>` | Good |
| `ChatMessage` / `MessageParts` | user/assistant, reasoning collapsed, tool/delegation cards, tripwire alert per processor, low-confidence pill + hint, interrupted pill + hint, citations numbered, sources list, attachments, form/picker submissions as chips | raw tool/command names (C-08); sent attachments not openable (P-14) | Good |
| `SafeMarkdown` | raw HTML skipped, link policy (http(s) + host shown, new-tab note), images not loaded, streaming repair, tables in scroll wrapper | fenced code has no copy (C-06) | Good |
| `ChatHistorySidebar` | loading, 403 no-access, error + retry, offline notice, empty / empty search / empty archived, search debounce, archived toggle (`aria-pressed`), load more, polling while answering | count = loaded rows only (C-09) | Good |
| `ConversationItem` | active (`aria-current`), pinned and answering in words, relative time + exact tooltip, contrast fix on active row | — | Good |
| `ConversationActionsMenu` | rename (focus handoff), pin/archive toasts, summarize dialog loading/done/failed/empty, delete confirm + error + toast | pin/archive no pending state (C-10) | Good |
| `RenameConversationForm` / `HistorySearch` | required message, error next to field, Esc cancel, saving disables, focus back to row | — | Good |
| `AgentPicker` | loading, error + retry, only-assistant hint, assistant always selectable | — | Good |
| `ChatSidePanel` (shell right panel) | no project → empty state; permission gate; not on chat page | closing discards the thread, no way to continue it (C-01); close over "Nova conversa" in sheet (C-02) | Needs fix |
| AI ports (`conversation`, `message`, `tool`, `confirmation`, `code-block`, `inline-citation`, `sources`, `suggestion`, `shimmer`, `reasoning`, `attachments`, `agent`, `task`, `speech-input`, `audio-player`) | labelled regions, keyboard-scrollable `pre`/log, icon buttons named, shimmer reduced-motion, popover citations (not hover-only) | `chain-of-thought`, `plan`, `queue`, `context` unused (P-02) | Good |

## Findings

### Major

**C-01 · major · side panel / continuity · [seen]**
- Where: `app-shell/app-layout.tsx:69` (`content: panelOpen ? <RightPanel /> : null`); `widgets/chat-panel/ui/project-chat-panel.tsx:35` (no `onConversationChange`, no `onTurnSettled`).
- Problem: the right-panel chat is unmounted whenever the panel closes, and it never learns the id of the conversation it started. Closing the panel (or the compact sheet) mid-answer drops the live stream from view; reopening shows a fresh empty conversation. Nothing in the panel links to the conversation on the chat page.
- User impact: a member who asks something in the side panel, closes it to look at the page, and reopens it has lost the answer from view and must find it in the chat page history by title (generated later). Feels like data loss.
- Fix: keep the panel content mounted while hidden (render it with `hidden`/`inert` instead of `null`), or lift the started conversation id into the shell slot state and pass it back as `conversationId` when reopening; add an "Abrir no chat" action in the panel header that routes to `{ id: "chat", organizationId, projectId, conversationId }` once the thread has an id.

**C-02 · major · mobile layout · [inferred]**
- Where: `shared/ui/molecules/Sheet/Sheet.tsx:60` (close button `absolute top-4 right-4 size-7`); chat panel header `widgets/chat-panel/ui/chat-panel.tsx:145,158-161` (48 px header, "Nova conversa" at the right edge, `px-4`); history header `widgets/chat-history-sidebar/ui/chat-history-sidebar.tsx:103,107-112` (`h-12`, "Nova conversa" at the right edge, `px-3`). Both are rendered inside sheets below `lg`: `shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx:76-83` and `views/chat/ui/chat-view.tsx:70-78`.
- Problem: the sheet's close "X" (16–44 px from the top, 16–44 px from the right) sits on top of the "Nova conversa" button of both headers (≈8–40 px from the top, flush right).
- User impact: on phones and tablets a tap meant for "Nova conversa" closes the panel (or vice versa); the button is partly hidden.
- Fix: render these sheets with `showCloseButton={false}` and put a close button inside the panel/sidebar header (a named icon button), or add right padding to the headers when they are inside a sheet (`pr-12`). Confirm with one 360 px screenshot of both sheets.

**C-03 · major · approvals · [inferred]**
- Where: `features/chat-send/ui/chat-input.tsx:62` (`canSend` ignores the phase); `widgets/chat-panel/ui/chat-composer.tsx:55-63` (no awaiting-approval input); `widgets/chat-panel/ui/chat-tool-part.tsx:36` (`interactive` only for the latest message); `features/chat-approval/ui/tool-confirmation.tsx:89,141-155` (buttons disabled, no reason given).
- Problem: while the status line says "Aguardando sua aprovação." the composer still sends. After a new message the approval card is no longer the latest turn, so Approve/Decline become disabled forever with no explanation and the tool call stays "Aguardando aprovação". What `/v1/chat` does with a turn sent past an unanswered approval was not verified (no test covers it).
- User impact: an easy path to a dead approval (and possibly a failed next answer); the member does not know whether the action ran.
- Fix: block sending during `awaiting-approval` with a reason under the field ("Aprove ou recuse a ação acima antes de continuar."), or treat sending as an implicit decline (`respondToApproval({ approved: false, reason })` first). For cards that can no longer be answered, show a line such as "Esta aprovação expirou." instead of bare disabled buttons. Add a widget test for "send while awaiting approval".

### Minor

**C-04 · minor · uploads · [seen]**
- Where: `features/chat-upload/model/upload-queue.ts:73` (`hasUploadsInFlight` counts every purpose) vs `:76` (`hasUploadProblems` only `chat-attachment`); `widgets/chat-panel/ui/chat-composer.tsx:38`; `take` at `upload-queue.ts:198-203` only removes ready chat attachments.
- Problem: a file sent to the knowledge base (not part of the message) blocks sending ("Aguarde o envio dos anexos terminar.") while it uploads, and once ready its chip stays in the composer as "Na base de conhecimento. Indexando…" forever (it never updates to indexed and is not removed after sending).
- User impact: confusion about whether the document travels with the message; stale chip.
- Fix: filter `hasUploadsInFlight` by `purpose === "chat-attachment"` for the send block; drop ready knowledge items after a few seconds or after a toast ("Documento enviado para a base de conhecimento") instead of keeping them in the composer.

**C-05 · minor · long conversations · [seen]**
- Where: `widgets/chat-panel/model/use-older-messages.ts:55-57`.
- Problem: a failed "Carregar mensagens anteriores" swallows the error; the button just stops spinning.
- User impact: the member clicks again without knowing it failed (or that they are offline).
- Fix: keep an `error` state and render a short inline message with the button ("Não foi possível carregar mensagens anteriores.") or a `notify.error(describe(error).message)`.

**C-06 · minor · code blocks · [seen]**
- Where: `shared/lib/markdown/safe-markdown.tsx:87` (`controls={false}`); kit `shared/ui/ai/code-block.tsx:24-55`.
- Problem: fenced code in answers renders as a plain `pre` with no copy button, while tool input/output JSON uses `CodeBlock` with copy. (Whether Streamdown still shows a language tag with controls off was not verified.)
- User impact: copying code from an answer needs manual selection, which is error-prone on touch.
- Fix: map Streamdown's `code`/`pre` component to the kit `CodeBlock` (language from the fence, `label` from i18n), keeping the no-wasm/no-shiki decision.

**C-07 · minor · approvals copy · [seen]**
- Where: `features/chat-approval/ui/tool-confirmation.tsx:109-111`.
- Problem: the card shows the raw permission id in mono (`Permissão: core.project.create`), while `packages/i18n/src/messages/pt-BR/permissions.json` already has a label for that exact path ("Criar projetos").
- User impact: technical code in a decision the member must understand.
- Fix: `const tPermissions = useTranslations("permissions")`; show `tPermissions.has(p) ? tPermissions(p) : p` (keep the id in a `title` if support needs it).

**C-08 · minor · raw ids shown to users · [seen]**
- Where: `features/generative-ui/ui/components/schema-form-part.tsx:32,35` ("Formulário: {commandId}" in mono); `entities/message/ui/message-parts.tsx:136` ("Formulário enviado: {command}" with the commandId), `:107` ("Ferramenta {toolName}"), `:84` (delegation step tool names), `:67` (unknown agent → "Agente {id}"); `features/generative-ui/ui/components/approval-pending-part.tsx:24` ("Pedido {approvalId}"); `features/chat-approval/ui/tool-confirmation.tsx:86-87` (fallback summary "Executar {tool}"); `features/generative-ui/ui/components/data-table-part.tsx:56` and `chart-part.tsx:113` (header falls back to the raw key).
- Problem: internal identifiers (`core.project.create`, `catalog.renderForm`, approval ids, data keys) are the visible names of cards, chips and headers.
- User impact: copy feels technical and inconsistent with the rest of the pt-BR UI.
- Fix: resolve names through i18n first — a `chat.tools.<toolName>` map for core tools, a label for commands (contract metadata or the permission label of the command), and keep raw ids only as a secondary mono line or `title`; drop the approval id from the four-eyes card (the inbox link is enough) or move it behind "Detalhes".

**C-09 · minor · history list · [seen]**
- Where: `widgets/chat-history-sidebar/ui/chat-history-sidebar.tsx:117-119` vs `:144-148`.
- Problem: the count says "{n} conversas" for the rows loaded so far (page size 30, `entities/conversation/api/conversations-api.ts:16`) while "Carregar mais conversas" shows more exist.
- User impact: "30 conversas" is wrong for a member with 120.
- Fix: show the count only when `!hasNextPage`, or phrase it as "30+ conversas" / "Mostrando 30".

**C-10 · minor · double-submit · [seen]**
- Where: `features/chat-history/ui/conversation-actions.tsx:90-97`; `features/chat-history/model/use-conversation-actions.ts:39-46`.
- Problem: pin/unpin and archive/restore have no pending state; re-opening the menu before the list refreshes still shows the old label and a second activation flips it back.
- User impact: toggles that seem not to stick; two toasts that contradict each other.
- Fix: optimistic update of the cached row (`setQueryData`) or a per-row pending flag that disables those items until the PATCH settles.

**C-11 · minor · orientation · [seen]**
- Where: `widgets/chat-panel/ui/chat-panel.tsx:147-149` (header always "Assistente"); `views/chat/ui/chat-view.tsx:57` (h1 "Chat").
- Problem: the open conversation's title is not shown anywhere in the panel. On compact layouts the history is in a closed sheet, so nothing identifies which conversation is open.
- User impact: after following a link or reload, the member cannot tell which thread this is or rename it without opening the history.
- Fix: show the conversation title (or "Nova conversa") in the panel header, truncated, with the agent as secondary text; keep "Assistente" as the region label.

**C-12 · minor · voice · [seen]**
- Where: `features/chat-voice/ui/composer-voice.tsx:44-47`.
- Problem: the realtime voice "connecting/live/error" states are only in an `sr-only` status; a failed start just returns the button to idle for sighted users.
- User impact: the member does not see that the voice conversation failed.
- Fix: show the error visibly (same pattern as the push-to-talk status line, `text-destructive-text`) and a visible "ao vivo" indicator while live.

**C-13 · minor · keyboard · [seen]**
- Where: `features/chat-voice/ui/push-to-talk-button.tsx:18,39-50`.
- Problem: `Ctrl+Space` is captured on the whole document and `preventDefault`ed. It is the input-method switch on Windows (CJK IMEs) and on macOS by default, and a common editor shortcut.
- User impact: members who switch input methods start recordings by accident (microphone prompt) and lose the OS shortcut while the chat is open.
- Fix: scope the shortcut to the composer (listen on the thread element), or choose a non-conflicting chord (e.g. `Ctrl+Shift+Space`) and document it in `atalhos.html`.

**C-14 · minor · layout · [inferred]**
- Where: `views/chat/ui/chat-view.tsx:55` (`h-[calc(100svh-3.5rem-3rem)]`, `lg:…-4rem`); banners above it in `app-shell/app-layout.tsx:74-75` (`mb-4`); main padding in `shared/ui/templates/AppShellTemplate/AppShellTemplate.tsx:64`.
- Problem: the chat height is computed from the topbar and main padding only. When the offline or impersonation banner shows, the page grows past the viewport.
- User impact: two scrollbars (page and log), and the composer is pushed below the fold exactly when offline.
- Fix: make the main area a flex column with the chat as `flex-1 min-h-0` instead of a viewport calc, or subtract the banner height via a CSS variable set by the shell.

**C-15 · minor · generative UI after the turn moved on · [seen]**
- Where: `features/generative-ui/ui/components/schema-form-part.tsx:39` (form not rendered when `!interactive`); `features/generative-ui/ui/components/picker-part.tsx:27,87` (local `submitted` state only).
- Problem: a form from an older turn shows only its heading (the fields vanish with no message); after a reload an answered picker shows disabled options with nothing chosen and no "Escolha enviada", although the next user chip says what was chosen.
- User impact: looks broken when scrolling back through a conversation.
- Fix: when `!interactive` and not submitted, render a short note ("Este formulário não está mais ativo.") or the read-only values; derive "answered" for pickers/forms from the following user message (`parseUiSubmission`) so history shows the choice.

### Polish

**P-01 · polish · tokens · [seen]** — 65 arbitrary sizes (`text-[12.5px]`, `text-[11.5px]`, `text-[13px]`, `text-[10.5px]`) in scope, e.g. `widgets/chat-panel/ui/status-line.tsx:67`, `features/chat-send/ui/chat-input.tsx:90,98,101`. `.design-system/DESIGN.md:82` names the Tailwind `text-*` scale, but the `chat.html` prototype itself uses 12.5/11.5 px, so this looks intentional. Fix: add `--text-2xs/--text-xs-plus` tokens in `@theme` and use them, so the scale is named once.

**P-02 · polish · kit hygiene · [seen]** — `shared/ui/ai/chain-of-thought.tsx`, `plan.tsx`, `queue.tsx`, `context.tsx` (and the `chat.elements.context.*` keys) are not used anywhere. Fix: keep them documented as reserved for modules, or remove until needed.

**P-03 · polish · duplicate primary action · [seen]** — on desktop "Nova conversa" appears twice (`chat-history-sidebar.tsx:107-112`, `chat-panel.tsx:158-161`); the sidebar one navigates without `fresh`, so the composer does not take focus (`chat-panel.tsx:193-197` vs `:205-209`). Fix: keep one (panel header) or make both call the same handler that focuses the composer.

**P-04 · polish · offline copy · [seen]** — offline is said twice: "Sem conexão." in the status line (`status-line.tsx:52-53`) and "Sem conexão. Envio indisponível…" under the field (`chat-input.tsx:63,98`), plus the shell `OfflineBanner`. Fix: keep the composer reason and the banner; drop the status-line text while offline unless a failed turn needs retry.

**P-05 · polish · copy · [seen]** — placeholder "Enviar mensagem" equals the send button's name (`chat.json` `input.placeholder`, `elements.send`); the keyboard hint "Enter envia · Shift+Enter… · Esc interrompe" is always visible, also on touch (`chat-input.tsx:101-103`). Fix: placeholder like "Pergunte ou peça algo…"; hide the hint below `sm` or on `(pointer: coarse)`.

**P-06 · polish · naming · [seen]** — the page h1 is "Chat" (`chat.view.title`) and the region h2 is "Assistente" (`chat.panel.title`); the shell toggle says "Assistente" (`shell.rightPanel.toggle`) and the compact history button says "Conversas". Fix: one name for the feature in pt-BR (the page h1 "Assistente", matching the toggle).

**P-07 · polish · empty state · [seen]** — "Conversa não encontrada" (`chat-panel.tsx:109`) has no action. Fix: add "Nova conversa" as the primary action of the `EmptyState`.

**P-08 · polish · suggestions · [seen]** — a suggestion card sends at once (`chat-thread.tsx:191`, `send`), with no chance to edit the prompt. Fix: put the prompt in the draft and focus the field (or offer both).

**P-09 · polish · layout shift · [seen]** — the generative Suspense fallback is `h-24` (`generative-part.tsx:79`) while the lazily loaded chart is ~`h-56` plus legend (`chart-part.tsx:96`). Fix: let each registry entry declare a skeleton height, or use `h-56` for charts.

**P-10 · polish · voice feedback · [seen]** — recording auto-stops at 60 s (`chat-voice/model/push-to-talk.ts:8,151`) with no elapsed time or warning while recording. Fix: show `0:42 / 1:00` next to the voice status.

**P-11 · polish · regenerate · [seen]** — "Gerar novamente" replaces the last answer with no way back (`use-chat-session.ts:211-215`). Fix: acceptable for v1; consider keeping the previous answer collapsed ("Resposta anterior").

**P-12 · polish · attachments input · [seen]** — files can only be added through the "+" menu (`features/chat-upload/ui/attach-menu.tsx:40-53`); no paste or drag-and-drop onto the composer. Fix: accept `paste` and `drop` on `PromptInput` and route them to `queue.add(…, "chat-attachment")`.

**P-13 · polish · error mid-stream · [seen]** — when a turn ends in `error` with partial text, the partial answer is not marked (only stop/lost set `interruptedMessageId`, `use-chat-session.ts:228`), and "Tentar novamente" regenerates and discards it (`:203-209`). Fix: mark the partial answer "Incompleta" like the interrupted pill.

**P-14 · polish · sent attachments · [seen]** — attachments of sent messages render name + icon only, without size, preview or a way to open them (`entities/message/ui/message-parts.tsx:221-227`). Fix: add size as `detail` and a download/open action via the files API.

## Counts

- blocker: 0
- major: 3 (C-01, C-02, C-03)
- minor: 12 (C-04 … C-15)
- polish: 14 (P-01 … P-14)
