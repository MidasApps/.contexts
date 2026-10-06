# B1: Kit dialogs (dismissal guard and height) fixes

Batch B1 of `consolidated.md`: U-02 and U-03. Both findings still held when re-checked on
`140151d3`. No `onEscapeKeyDown`, `onInteractOutside` or `onPointerDownOutside` guard existed in
`src`, and `centeredModalClasses` had no `max-h-*` or `overflow-y-auto`. Decision:
`app/docs/decisions/0048-dialog-dismissal-guard.md`.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-02 (kit) | S-M1, ADM-01, S-p6 | fixed | `feat(client): guard dialog dismissal and cap dialog height` | `shared/ui/molecules/Dialog/dialog-dismiss-guard.test.tsx` (block, confirm unsaved, confirm one-time, keep/discard focus, Esc on the question closes only the question, strictest declaration wins, axe) |
| U-02 API key secret | S-M1 | fixed | `fix(client): keep one-time secrets, links and codes on dismissal` | `views/settings-api-keys/ui/SettingsApiKeysView.test.tsx` "keeps the dialog while the key is created, and asks before Escape drops the unseen secret" |
| U-02 invitation link | S-M1 | fixed | same | `views/settings-invitations/ui/SettingsInvitationsView.test.tsx` "asks before Escape or the close button drops the one-time link" |
| U-02 device code | S-M1 | fixed | same | `views/settings-devices/ui/SettingsDevicesView.test.tsx` "asks before Escape drops a live activation code" |
| U-02 knowledge upload | S-p6 | fixed | `fix(client): keep the knowledge upload dialog open mid-upload` | `features/knowledge-upload/ui/AddKnowledgeDocumentDialog.test.tsx` "cannot be closed while the upload runs" |
| U-02 prompt editor | ADM-01 | fixed | `fix(admin): ask before discarding an edited prompt or plan` | `views/admin-agent-prompts/ui/AdminAgentPromptsView.test.tsx` "asks before Escape or Cancel discards an edited prompt, and closes an untouched one at once" |
| U-02 plan form | ADM-01 | fixed | same | `views/admin-plans/ui/AdminPlansView.test.tsx` "closes an untouched plan on Escape and asks before discarding an edited one"; `SchemaForm.test.tsx` "reports clean values on mount and dirty ones once the user changes something" |
| U-03 dialog height | SH-04 | fixed | `feat(client): guard dialog dismissal and cap dialog height` | `shared/ui/styles/modal-classes.test.ts`; e2e `apps/web/e2e/settings.spec.ts` "on a 360×640 phone the tall key dialog fits…" (written, not run here; the final verifier runs Playwright) |

## What changed

- `Dialog` owns dismissal. `useDialogDismissGuard("allow" | "block" | "confirmUnsaved" | "confirmOneTime")`
  is declared from inside the dialog. While the guard is `block`, the X is hidden. The question is
  an `AlertDialog` with copy in `common.dialogGuard` (3 locales). An uncontrolled `Dialog` keeps its
  own state, so the guard always applies.
- Create dialogs (API key, invitation, device) are `block` while the request is in flight. Before,
  closing then created the value and lost its only copy. This is the same bug class as the finding,
  but the review did not list it.
- `OneTimeSecret` (until "I stored it"), `InvitationLink` and `ActivationCode` (until it expires)
  declare `confirmOneTime`. "Done" and "Another" stay direct.
- The prompt editor Cancel is now a `DialogClose`, so it is guarded as well.
- The centered surface: `max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain`.
  `CreateApiKeyDialog` dropped its inner `max-h-[70vh]` scroll and its sticky footer.

## Notes for other batches

- These dialogs still scroll their own form (`max-h-[70vh] overflow-y-auto`). This works, but
  they should drop it when next touched: `ConnectorEditorDialog`, `CustomAgentEditorDialog`,
  `CustomSkillEditorDialog`, `RoleEditorDialog`, `ScheduleEditorDialog` (B7) and
  `StartWorkflowRunDialog` (B7/B9).
- `EnrollTotpDialog` (B4) gets the height cap from the kit. Its file was not edited.
- Other form dialogs do not declare `confirmUnsaved` yet. This is follow-up #93.
- The X scrolls with the content in a tall dialog. The footer is not sticky by default (decision 0048).
