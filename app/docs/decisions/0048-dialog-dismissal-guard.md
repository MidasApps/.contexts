# 0048. Dialog dismissal guard and height cap

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/client` (kit `shared/ui/molecules/Dialog`, `SchemaForm`, every dialog in web and desktop)

## Context

The UX review (`docs/plans/2026-10-01-ux-review/consolidated.md`, U-02 and U-03) found that Esc,
a click outside or the X closed every dialog without a check. This lost one-time values (API key
secret, invitation link, device code), unsaved work (prompt editor, plan form) and could close a
dialog mid-upload or mid-request, after the server had already created the value. Separately,
the centered dialog surface had no height cap, so tall dialogs (MFA enrollment, long forms) were
cut off on phones and short windows.

## Decision

1. The kit `Dialog` owns dismissal. Content inside a dialog declares how a user-initiated close
   (Esc, outside click, X, `DialogClose`) is handled with `useDialogDismissGuard(mode)`:
   - `allow` (default): close.
   - `block`: work is in flight (a create request, an upload). Nothing closes and the X is hidden.
   - `confirmUnsaved`: edited values would be lost. Ask "Discard changes?" first.
   - `confirmOneTime`: a value shown only once would be lost. Ask "Close without storing it?" first.
   Several parts may declare at once; the strictest mode wins. Copy lives in
   `common.dialogGuard` (pt-BR, en-US, es-419). Closes made by the owner in code
   (`onOpenChange(false)` after a save, "Done" after acknowledgement) are never guarded.
2. The question is an `AlertDialog` stacked over the dialog. Esc or "keep" closes only the
   question and returns focus where it was. "Discard" closes both, and focus returns to the
   dialog trigger.
3. When `Dialog` is uncontrolled, it keeps its own open state, so the guard always applies.
4. The centered modal surface caps at `100svh - 2rem` and scrolls (`overflow-y-auto`,
   `overscroll-contain`). Forms no longer need their own `max-h-[70vh]` scroll.
5. Rule for new dialogs: block while a request that creates something is in flight; declare
   `confirmOneTime` while a one-time value is on screen; declare `confirmUnsaved` when the form
   holds typed work that has no draft. `SchemaForm` reports this through `onDirtyChange`.

## Consequences

- One-time values and long edits survive a reflexive Esc. Uploads and create requests cannot be
  orphaned by closing.
- The X scrolls with the content in a tall dialog. Header and footer are not sticky by default.
  A kit-wide sticky footer would change 28 dialogs that other work is changing too.
- Dialogs that still have their own inner scroll (`max-h-[70vh] overflow-y-auto` on the form)
  keep working, but they scroll inside a scrolling surface. They should drop it when next touched.
- Other form dialogs (roles, schedules, connectors, custom agents and skills) do not declare
  `confirmUnsaved` yet. This is tracked as a follow-up.

## Alternatives considered

- A `dismissible`/`confirmDiscard` prop on `DialogContent`. Rejected: in most dialogs the
  deciding state (`pending`, the secret, the draft) lives in a body mounted inside the content,
  so a prop would force lifting that state in every dialog.
- Strict modal for one-time values (no way out until acknowledged). Rejected: it traps users who
  really want to leave. A confirmation keeps the way out and makes the loss explicit.
- A per-dialog `onEscapeKeyDown`/`onInteractOutside` guard. Rejected: it misses the X and
  `DialogClose`, and it duplicates the same logic in every dialog.
