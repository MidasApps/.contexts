# SP4/SP5 gate fixes report

Branch `feat/agentic-app-core-sp0`. Date 2026-10-02. Items: follow-ups 78–92 of
`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`, found by `reports/sp5-gate.md` and
`docs/plans/2026-09-29-sp4-chat/reports/sp4-gate.md`.

The fixes were made in a scratch worktree, then rebased onto the branch after the 14 UX/UI batches
(`docs/plans/2026-10-01-ux-review/fixes-*.md`). The rebase dropped one commit. The rest replayed
with conflicts in the admin and settings views, the i18n catalogs and the e2e specs. Those were
merged by hand. The generated files (`docs/catalog`, `docs/openapi`) were regenerated, and
`contracts:check` passes on the result.

## Items

| # | Item | Result | Commits | Tests |
|---|---|---|---|---|
| 78 | Approval-requests 500 on the project page | open (not reproduced) | — | see below |
| 79 | First upload times out on a cold Functions trigger | fixed | `6cfeeafa` | `features/chat-upload/model/upload-queue.test.ts`, `chat-upload/ui/attachment-chips.test.tsx`, `AddKnowledgeDocumentDialog.test.tsx` (still processing after 30 s, keeps polling up to 5 min) |
| 80 | Chat e2e once, chromium, 2 workers | open (by design) | — | documented limitation, no defect |
| 81 | Realtime voice and Tauri CSP not in e2e | open (by design) | — | documented limitation, no defect |
| 82 | Cancelled run leaves its approval request pending | fixed | `8a47962e`, `52204be0` (cancel copy) | `access/.../approval-sweeps.test.ts`, `agents/.../workflow-run-routes.test.ts`, `operations-console.test.ts`, `mastra/.../workflow-ports-binding.test.ts`, `workflow-hitl.emulator.test.ts`; `CancelRunDialog.test.tsx`, `AdminWorkflowsView.test.tsx`; e2e `settings-workflows.spec.ts` (request shows Cancelada), `settings-approvals.spec.ts` (exact count `Aguardando minha decisão (2)`), `admin-operations.spec.ts` (copy) |
| 83 | Fake models have no price | fixed | `53206a52`, `b44792d8` | `agents/.../model-prices.test.ts`, `usage-ledger-exporter.test.ts`; e2e `admin-observability.spec.ts` (cost > 0, priced trace) |
| 84 | Request logs end in `_ok` for 4xx | fixed | `8c22fd60` | `services/.../route-boundary.test.ts`, `functions/.../healthz-handler.test.ts` |
| 85 | Flag descriptions English on pt-BR pages | fixed | B9 `60067936` (names, organization page) + `97617f41` (staff list and confirmations) | `SettingsFlagsView.test.tsx`; `AdminFlagsView.test.tsx` (pt-BR description in the row and in the kill-switch confirmation) |
| 86 | Prompt editor starts empty with no version | fixed | `fe297755`, `ab59bbc1` (lint) | `agents/.../prompt-seed.test.ts`, `admin-operations-routes.test.ts`, `AdminAgentPromptsView.test.tsx` (prefilled from the code seed, 502 → empty) |
| 87 | `turbo run test:e2e` never exits on Windows | fixed | `51b62e40` | `scripts/src/e2e/e2e-steps.test.ts`, `e2e-env.test.ts`; `pnpm test:e2e` run (below) |
| 88 | Functions emulator stops dispatching in a long-lived stack | open | — | emulator behaviour, not addressed here |
| 89 | Organization picker options outside the viewport | fixed | `1a6d62d9` | `shared/ui/molecules/Combobox/Combobox.test.tsx` |
| 90 | Automatic schedule fire not shown in the browser | open | — | belongs to SP5 Task 17's criterion journey |
| 91 | Knowledge run without a document is silent | fixed | `05e6ece1` | `SettingsKnowledgeView.test.tsx` (notice with reference, retry, dismiss) |
| 92 | `/admin` while impersonating | fixed | `e1631126` | `app-shell/admin-layout.test.tsx` (support mode mounts no page and explains) |

Dropped: the original #85 commit `a1a6e180` (`fix(i18n): show flag descriptions in the page language`,
which added `common.featureFlags.reasons`). B9 `60067936` had already done most of it, using the
`common.flags.<key>.name|description` catalog. All six registry flags have both in the three
locales (36 of 36 checked). The part B9 left out was the staff flags list and its
set and clear confirmations, which still quoted the registry's English reason. `97617f41` covers
that part. The e2e follow-up commit was reduced to the priced trace (`b44792d8`); its
translated-flag expectations already came with B9.

`52204be0` is new. After #82, the staff cancel confirmation still said the awaited request
"continua aberta e expira sozinha". The organization's confirmation said the request "deixa de ter
efeito". Both now say the request is cancelled with the run, in all three locales.

## #78: one more reproduction attempt

- Stack: e2e emulators on scratch ports 47381–47591 (a temporary copy of the `firebase.e2e.json`
  ports, not committed). Web `next start` ran on 3120 with its stdout piped into the run log. The
  agents ran on 47191.
- Specs: Playwright `--project=console --project=chat` on `e2e/settings-*`, `e2e/admin-*` and
  `e2e/chat-form-approval`, with `--workers=1`.
- Result: 52 calls to `GET /v1/organizations/{id}/approval-requests` were logged, and all 52 were
  `access_list_approval_requests_ok` with status 200. No response anywhere in the run had a 5xx
  status.
- What did show up: five `ResponseAborted` entries logged at `error` (`*_failed`) when the browser
  navigated away mid-request. Examples: `agents_list_catalog_failed`, `workflows_list_runs_failed`,
  `workflows_stream_run_failed`. None of them reached a client as a 500.
- The follow-up stays open with this evidence. If it recurs, check whether the console error was an
  aborted request.

## Verification (rebased tree, on top of `9c07de17`)

- Unit tests (`vitest run --project unit`, or plain `vitest run` where there is one project):

  | Package | Files | Tests |
  |---|---|---|
  | services | 138 | 971 |
  | agents | 83 (1 skipped) | 627 (1 skipped) |
  | mastra | 14 | 67 |
  | functions | 4 | 27 |
  | scripts | 18 | 86 |
  | contracts | 37 | 427 |
  | i18n | 9 | 52 |
  | web | 13 | 85 |
  | client (`--maxWorkers=2`) | 276 | 1455 |

  Every test passed.
- `pnpm typecheck` passed (13/13). `pnpm i18n:check` passed (10 namespaces, 30 catalogs).
  `pnpm contracts:check` passed (149 contracts, 168 endpoints).
- `pnpm lint` failed once on the rebased tree. The #86 test cast the textbox with a type assertion,
  which the lint rule rejects. `ab59bbc1` fixed it, and lint now passes (13/13).
- Emulator suites, run on scratch ports with the compose Postgres:

  | Package | Files | Tests |
  |---|---|---|
  | services | 41 | 210 |
  | agents | 1 | 6 |
  | mastra (incl. `workflow-hitl.emulator.test.ts`) | 9 | 42 |

  All passed. The functions suite has to run on the default ports, because `healthz.emulator`
  targets port 5001. It passed there: 3 files, 9 tests.
- e2e, once with `--workers=1` (`--project=console --project=chat` on `settings-*`, `admin-*` and
  `chat-form-approval`): 54 passed, 1 failed.
  - The failure was `admin-console.spec.ts` › plans › "edits a plan's limits". The Edit dialog
    never opened after the create.
  - Observed runs of that test on this tree: it failed 2 of 3 times. The third run passed
    (11 of 11, with nothing else running).
  - It passed every time (4 of 4) on these trees:
    - the base `9c07de17`;
    - the base plus `e1631126`;
    - the base plus 6 of the gate commits;
    - the base plus 8 app commits (all but `b44792d8` and `51b62e40`, which only change an e2e
      expectation and the e2e runner).
  - It is flaky and not attributable to these commits; the cause was not found.
- `pnpm test:e2e` (the default command after #87) exited on its own after 1065 s.
  - Web: 500 passed, 2 skipped, 1 failed. Desktop: 5 passed.
  - The web failure was `settings-workflows.spec.ts` › schedules. With 4 workers, the "Excluir o
    agendamento" menu item never became stable. The same spec passed in the single-worker run.
  - The emulators and servers stopped: none of the e2e ports was still listening afterwards.
- `git diff --quiet main -- .contexts .claude && echo framework-ok` printed `framework-ok`.
