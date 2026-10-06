# B8: Tables and settings layout fixes

Batch B8 of `consolidated.md`: U-16, U-19, U-56. Every finding still held when re-checked on
`16d3c59e`: `SettingsTemplate.tsx` had `md:w-[220px]` + `max-w-[720px]` and no gap on the
section; `DataTable` switched to cards only below the `md` viewport and its error status carried
only `requestId`; seven settings views and `ProfileSessionsView` each had their own `statusOf`;
`UsageBreakdown` had no `renderCard`; `ScheduleTable` rows carried up to four buttons. B9 had
already landed on `ScheduleTable.tsx` (labels), so the shared-file note no longer applied.
Decision: `app/docs/decisions/0053-data-table-layout-and-errors.md`.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-19 table errors by code, 403 → no-access, pending retry, one `dataTableStatusOf` | SH-11, S-m1 | fixed | `b7ec49fd` fix(client): show the error code and no-access in data tables | `shared/ui/organisms/DataTable/DataTable.test.tsx` ("shows loading, empty and error states" with `NETWORK_ERROR` copy, "shows the retry as pending…", "renders the no-access state, without a retry, for a 403"); `data-table-status.test.ts` (3 cases); `views/profile-sessions/ui/ProfileSessionsView.test.tsx` (429 copy + retry, 403 no-access) |
| U-16 settings layout: section column only from `lg`, `width="wide"` for list sections | S-M3 | fixed | `c247384b` fix(client): give settings tables the width they need | `shared/ui/templates/SettingsTemplate/SettingsTemplate.test.tsx` ("…caps it for reading by default", "lets list sections use the full width"); `widgets/settings-nav/ui/SettingsNav.test.tsx` ("lets list sections use the full width, and keeps no-access at reading width") |
| U-16 cards by container width | S-M3 | fixed | `5bbc6daa` feat(client): turn data tables into cards when their column is narrow | `DataTable.test.tsx` "DataTable in a narrow container" (3 cases, `ResizeObserver` replaced locally) |
| U-16 schedule row actions in a menu | S-M3 | fixed | `301ddbbc` feat(client): group schedule row actions in a menu | `widgets/schedule-table/ui/ScheduleTable.test.tsx` ("keeps pause and run-now on the row and groups the caller's actions in a menu", "shows no menu when the caller has no more actions"); `views/settings-workflows/ui/SettingsWorkflowsView.test.tsx` (edit and delete through the menu, read-only has no menu) |
| U-16 admin "Uso por modelo" cards | ADM-13 | fixed | `0ef05034` fix(admin): show usage by model as cards on narrow screens | `views/admin-costs/ui/AdminCostsView.test.tsx` "lists the usage by model as cards on phones" |
| U-56 Knowledge and Usage vertical spacing | S-m2 | fixed | `c247384b` (template `<section>` is `flex flex-col gap-6`; `ProfilePageFrame` notice lost its `mb-6`) | `SettingsTemplate.test.tsx` "spaces the blocks of a section…" |
| ADR | — | done | `6b64b62b` docs(client): record the data table layout and error decision | — |

Deferred: none.

## Notes

- Not screenshotted at 768 and 1280 px: the brief excludes Playwright runs here; the final
  verifier runs e2e. Expected widths (sidebar 260 px, gutters 40 px): settings content 680 px at
  1280 px, so tables of up to 7 columns stay tables and the 9-column experiments list becomes
  cards; at 768–1023 px the section nav is the pill row and the content takes the full column.
- e2e specs updated without running them: `settings-workflows.spec.ts` opens the row menu for
  edit/delete; `settings-observability.spec.ts` accepts the experiments list as table or cards.
- Card threshold: 88 px per column, at least 480 px (`COLUMN_MIN_WIDTH`, `TABLE_MIN_WIDTH`),
  overridable per table with `minTableWidth`.

## Verification (on `6b64b62b`, branch head unchanged at `16d3c59e`)

- `packages/client`: `vitest run --maxWorkers=2` → 251 files, 1282 tests passed; `tsc --noEmit` ok;
  `eslint .` ok.
- `packages/i18n`: `vitest run` → 9 files, 51 tests passed; `pnpm i18n:check` → ok (10 namespaces,
  30 catalogs).
- `apps/web`: `next typegen && tsc --noEmit` ok; `eslint .` ok (e2e specs not run).
- Contracts untouched (no `contracts:check` needed).
