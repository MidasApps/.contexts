# B14: Type scale, loading skeletons and missing tests

Batch B14 of `consolidated.md`: U-62, U-25, U-35. Every finding still held when re-checked on
`38a09d3a`:
- 220 `text-[Npx]` uses remained in 112 client files.
- `ShellSkeleton` and the desktop `UserAreaGate` still showed a full-screen spinner.
- `AdminPageFrame` still rendered actions only when `allowed`.
- The generative UI fallback was still `h-24`.
- No `features/admin-*` slice and five of the six widgets had a colocated test. `ScheduleTable` had one, but it did not cover time zones.
- `a11y.spec.ts` did not cover invite, MFA, not found, open dialogs, the banner or es-419.

Decision: `app/docs/decisions/0057-type-scale-loading-skeletons-and-offline-forms.md`.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-62 type scale tokens | P-01, ADM-37, S-p1 | fixed | `4fde1206` feat(client): add type scale tokens…; `0d49c8dc` refactor(client): use the type scale tokens… | `shared/ui/styles/type-scale.test.ts` (tokens declared without their own line height; no `text-[Npx]` left in the client sources); `shared/lib/cn.test.ts` "reads the type scale steps as font sizes, never as colors" |
| U-25 shell skeleton (web + desktop) | SH-13 | fixed | `d7aad877`, `d51eea70`, `2c6c31ee` | `shared/ui/templates/AppShellSkeleton/AppShellSkeleton.test.tsx` (3 cases, axe); `apps/desktop/src/app/desktop-app.test.tsx` "draws the shell's frame, not a lone spinner, while the session is restored" |
| U-25 admin page actions pop in | ADM-18 | fixed | `27a2f01a` | `widgets/admin-nav/admin-nav.test.tsx` "reserves the actions slot while the staff role loads…", "drops the reserved slot once the role is known to lack the permission" |
| U-25 generative UI skeleton height | P-09 | fixed | `4fe19392` | `features/generative-ui/ui/generative-part.test.tsx` "while a lazy component loads" (3 cases) |
| U-35 colocated tests, admin features | ADM-28 | fixed | `de6f07e4`, `1cf9a200`, `f2be27fa` (+ fixes `048d8a50`, `f2a9d808`, `d0313dcc`) | `features/admin-cancel-run/ui/CancelRunDialog.test.tsx`, `admin-schedule-actions/ui/schedule-actions.test.tsx`, `admin-set-flag/ui/flag-dialogs.test.tsx`, `admin-update-organization/ui/organization-writes.test.tsx`, `admin-update-plan/ui/PlanFormDialog.test.tsx`, `admin-prompt-version-editor/ui/PromptVersionDialog.test.tsx`, `admin-prompt-activation/ui/PromptActivationDialog.test.tsx`, `admin-agent-enablement/ui/AgentEnablementPanel.test.tsx`, `admin-impersonation/ui/impersonation-writes.test.tsx`: success, pending, failure with reference, offline |
| U-35 colocated tests, 6 widgets | ADM-28 | fixed | `00698dc5` | `widgets/admin-kpi-cards/…/AdminKpiCards.test.tsx`, `admin-prompt-diff/…/PromptDiff.test.tsx`, `experiment-compare/…/ExperimentCompare.test.tsx` (every outcome, every panel state), `impersonation-banner/…/ImpersonationBanner.test.tsx`, `run-timeline/…/RunTimeline.test.tsx`, `schedule-table/…/ScheduleTable.test.tsx` (zone display) |
| U-35 axe matrix | SH-21 | fixed (written, not run) | `a1876f8b` | `apps/web/e2e/a11y.spec.ts`: invite without token, invite sign-in step, unusable invite, not found, open ConfirmDialog, second-factor enrollment dialog, SMS challenge step, support access banner, es-419 (sign-in + 3 pages) |
| ADR | — | done | `d2f35cb2` | — |

Deferred: none.

## Notes

- **Type scale mapping:**
  - 9 and 9.5 px became `text-micro` (9.5 px).
  - 10 and 10.5 px became `text-tiny` (10.5 px).
  - 11 px became `text-label`.
  - 11.5 px became `text-caption`.
  - 12 px became Tailwind's `text-xs`.
  - 12.5 px became `text-body-sm`.
  - 13 px became `text-body`.
  - 14.5 and 15 px became `text-title` (15 px).

  The new tokens declare no line height. The Tailwind 4.3.3 compiler then emits only `font-size`, the same output as the arbitrary values, so the replacement keeps every line height. Only the rounded sizes changed, by 0.5 to 1 px: the xs avatar, tag badges, group headings and the StatePanel title. The 12 px status spans also get `text-xs`'s 16 px line height.
- **DESIGN.md not edited:** decision 0014 says `.design-system/` is read-only and product-specific. The scale is recorded in ADR 0057, and the typography row of decision 0014 points to it.
- **Offline gaps found by the new tests:** `SchemaForm`, the new prompt version form and the forced activation form submitted while offline. Each now holds the submit and shows the offline notice. The tests were written first and failed before the fix.
- **Web skeleton:** an inner Suspense boundary reads the sidebar cookie before the session check. The static shell assumes an expanded sidebar, so a user who collapsed it can still see the column go from 260 px to 60 px.
- **e2e:** the new `a11y.spec.ts` cases were written for the final e2e run and were not run here. The emulator offers only the SMS factor, so the enrollment dialog checked is "Adicionar telefone". It uses the same dialog frame as TOTP.

## Verification (on `d2f35cb2`; branch head unchanged at `38a09d3a`, so no rebase was needed)

- `packages/client`: `vitest run --maxWorkers=2` passed 275 files and 1441 tests. `tsc --noEmit` and `eslint .` passed.
- `apps/desktop`: `vitest run` passed 15 files and 93 tests. `tsc --noEmit` and `eslint .` passed.
- `apps/web`: `vitest run` passed 13 files and 85 tests. `next typegen && tsc --noEmit` and `eslint .` passed. The e2e specs were not run.
- `pnpm i18n:check` (packages/i18n): ok, 10 namespaces and 30 catalogs. No keys were added.
- `pnpm contracts:check`: not needed, because no contract changed.
- `git diff --quiet main -- .contexts .claude && echo framework-ok`: printed `framework-ok`.
