# 0056. Shared state patterns of the client and chat polish

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/client` (`shared/lib/router`, `shared/api/live-list-polling.ts`,
  `shared/ui/organisms/{SchemaForm,ConfirmDialog}`, `shared/ui/molecules/IntegerInput`,
  `widgets/settings-nav`, `features/chat-voice`, `features/chat-send`, `widgets/chat-panel`,
  the settings and admin views listed in the fixes report), `app/packages/i18n`
- **Refines:** decision 0012 (route map and router port), decision 0034 (chat voice: the
  push-to-talk shortcut), decision 0035 (AI Elements kit)
- **Source:** UX review 2026-10-01, batches B11 (U-22, U-23, U-26, U-27, U-28, U-29) and B12
  (U-39, U-40, U-42, U-43, U-67, U-69, U-70, U-71 to U-76);
  report `docs/plans/2026-10-01-ux-review/fixes-b11_b12.md`

## Context

The review found the same few gaps on many screens: settings kept tabs, filters and pages in
component state while `/admin` kept them in the URL; lists of running work never refreshed; toggles
stayed live while their save was in flight; one-click changes lowered organization-wide guards;
offline states blamed permissions; forms said "saved" next to unsaved edits. In chat, the
push-to-talk shortcut took the operating system's input-method switch.

## Decision

1. **Page state in the URL.** The `settings` route carries an optional `search`, like `admin`.
   `useRouteSearch(keys, toRoute)` (shared router) reads and writes it with `replace`; a new value
   returns to page 1; `useAdminSearch` and `useSettingsSearch` are thin wrappers. Links between a
   settings list and its detail pages carry the current query string (`SettingsSectionLink`,
   `useCarriedSearch`), so "back" returns to the same tab, filters and page. Pickers whose value may
   be stale fall back to their default (`searchOption`). Cursor pages (runs) stay in memory.
2. **Live lists poll while something is live.** A list of runs or experiments re-reads every 5 s
   (`LIVE_LIST_POLL_MS`) while any loaded row can still change, and stops once every row has
   settled (`pollWhileAnyLive`, `pollWhilePageLive`).
3. **One save at a time per control group.** A toggle is disabled while its save is in flight.
   Controls that send a shared document (the agent switches of an organization) share one lock
   through a TanStack mutation key, so a failed save cannot roll back another one. The
   organization switch uses the same pattern and shows its pending state on the trigger.
4. **Changes that lower an organization-wide guard ask first.** Weakening the PII guardrail from
   redact to warn, turning on a web tool, removing the organization's own usage cap and activating
   agent instructions go through `ConfirmDialog`, naming the organization or the agent and version.
   The safe direction stays one click. Approving a request stays one click (its summary is on
   screen), but a failed execution is said on the request, not only in a toast.
5. **Offline.** `ConfirmDialog` holds its confirm and shows the offline notice while offline (a
   dialog may have opened online). Empty states choose their copy from the permission and only hold
   the action offline. The chat status line leaves plain offline to the shell banner and the
   composer reason.
6. **Form feedback.** `SchemaForm` hides "saved" while the values differ from the saved ones; edit
   forms of saved values pass `requireChanges`, which keeps submit off until a value changes.
   Whole-number caps use `IntegerInput` (digits, optionally grouped by the locale; shown grouped).
7. **Chat.** Push-to-talk is `Ctrl+Shift+Space` (`aria-keyshortcuts`), not `Ctrl+Space`, which is
   the input-method switch on Windows and macOS. A suggestion fills the draft instead of sending.
   Fenced code in answers renders through the kit `CodeBlock` (copy button, labelled region, still
   no highlighter). A partial answer of a failed turn is marked "Incompleta". Files may be pasted or
   dropped on the composer. A sent file opens through a short-lived read URL, fetched on demand.
   `ChainOfThought`, `Context`, `Plan` and `Queue` stay in the public AI kit, reserved for modules.

## Consequences

- Settings URLs are shareable and survive reloads; tests assert the URL through the memory router.
- Polling costs one request every 5 s per open list with live rows, and none otherwise.
- `.design-system/atalhos.html` (the prototype) does not list the voice shortcut; this decision is
  the reference until the prototype is revised.
- Follow-ups 99 to 101 hold what needs the server: telling the organization's own cap from the
  plan's, the failure code of an approved action, and keeping the previous answer on regenerate.

## Alternatives

- **Keep settings state in memory and restore it from session storage.** Rejected: not shareable
  and inconsistent with `/admin`.
- **Refetch after a failed agent switch instead of serializing.** Rejected: the screen still flips
  twice and disagrees with the server until the refetch lands.
- **Scope the voice shortcut to the composer.** Rejected for now: the global shortcut is the
  keyboard alternative to holding the button (WCAG 2.5.1); a chord with Shift keeps it global.
