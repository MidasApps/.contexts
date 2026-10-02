# 0049. The right panel closes itself and keeps its place while closed

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/client` (`shared/lib/shell`, `app-shell`, `AppShellTemplate`, `widgets/chat-panel`)
- **Refines:** decision 0011 §5 (shell UI store), decision 0015 (shell registries), SP4 Task 13 (chat side panel)

## Context

The shell's right panel (`ShellSlots.rightPanel`) is a component without props. Its content mounts
only while the panel is open, and below `lg` the panel is a sheet with the kit's corner close
button. The UX review (U-09, U-10) found two problems with the chat it hosts:

- closing the panel unmounted the chat, and the panel never learned the conversation it started:
  reopening it showed an empty conversation, which reads as data loss;
- the sheet's corner X sat on top of the chat header's "Nova conversa" button on phones and tablets.

Keeping the content mounted while hidden does not work below `lg`: a Radix dialog that stays
mounted while closed keeps hiding the rest of the page from assistive tech.

## Decision

1. **The slot receives `RightPanelProps = { onClose }`.** The content puts a named close button in
   its own header; the shell's sheet renders no corner X (`showCloseButton={false}`). Esc and the
   overlay still close the sheet, and the topbar toggle still closes the desktop panel.
2. **What the content must keep lives in the shell UI store**, under a generic
   `rightPanel: Record<string, string>` with `rememberRightPanel(key, value | undefined)`. It is
   memory only: not in `partialize`, never persisted, and `reset` (sign-out, organization switch)
   clears it. `shared` stays domain-free: the chat decides the key (`organizationId:projectId`) and
   the value (the conversation id).
3. **The chat side panel continues its conversation.** It reads the remembered id as its
   `conversationId`, records the id the server gives a new conversation, forgets it on "Nova
   conversa", and offers "Abrir na página do assistente" (the chat page at that conversation) once
   it has one. A reopened panel loads the stored conversation and re-attaches to a run that is still
   streaming (decision 0031), so an answer that was arriving when the panel closed is not lost.

## Consequences

- Every right-panel content must render its own close control (`onClose`); a content that does not
  is closable only with Esc, the overlay or the topbar toggle.
- A conversation survives closing the panel and moving between pages of the same project; it does not
  survive a reload (memory only) — the chat page history keeps it.

## Alternatives

- **Keep the content mounted with `hidden`/`inert`.** Rejected: impossible for the sheet below `lg`
  without fighting Radix's modal behaviour, and it keeps a live stream and its uploads running
  behind a closed panel.
- **Persist the conversation id in `localStorage`.** Rejected: a reload already has the chat page
  history, and persisted pointers to conversations outlive the account that owns them.
- **Pad the chat header (`pr-12`) instead of moving the close button.** Rejected: it keeps two
  close affordances apart from the header and wastes width in a 360 px panel.
