# UX review — fixes of batch B3 (error, session and not-found recovery)

Branch `feat/agentic-app-core-sp0`, 2026-10-02. Findings from [`consolidated.md`](consolidated.md)
§B3; decision [`app/docs/decisions/0051-error-session-and-not-found-recovery.md`](../../../app/docs/decisions/0051-error-session-and-not-found-recovery.md).
Paths are relative to `app/packages/client/src/` unless they start with `app/`.

Every finding was re-checked against the branch first; all four still held (S-p5 held on desktop
only: the web already answered not found through the shared route map).

| Finding | Status | Commit | Tests |
|---|---|---|---|
| U-06 (SH-05) server: `/v1/me` answers a `lastContext` only while the caller is a live member | fixed | `0068eb2f` fix(identity): drop a last context the caller no longer belongs to | `app/packages/services/.../identity/application/use-cases/me-use-cases.test.ts` ("answers the last context while the caller is still a member, and an empty one once it is gone"); `me-routes.emulator.test.ts` + `members-routes.emulator.test.ts` green on the emulators |
| U-06 (SH-05) client: not-found also links to the organization list | fixed | `5b39c030` fix(client): offer the organization list on the not-found page | `widgets/page-state/ui/PageState.test.tsx` |
| U-07 (SH-06) `[locale]/error.tsx` (shared `ServerErrorView` / `PageRenderError`) | fixed | `ca60196e` feat(client): add a server render error view; `b7b1b0ce` feat(web): render translated error pages for server render failures | `views/server-error/ui/ServerErrorView.test.tsx` |
| U-07 (SH-06) `app/global-error.tsx` (catalog copy, locale from the path) | fixed | `b7b1b0ce` | `app/apps/web/src/client/global-error-content.test.tsx`; e2e that forces a server error deferred to follow-up 94 (no trigger exists in the app) |
| U-21 (SH-09) 401 after the token refresh offers "Entrar novamente" (sign out, sign-in with `next`) | fixed | `73fca873` fix(client): offer signing in again when the session is gone | `shared/ui/molecules/ErrorState/ApiErrorState.test.tsx`, `widgets/page-state/ui/PageState.test.tsx` |
| U-36 (S-m6) missing run → not found with "Voltar às execuções" | fixed | `11d24dec` fix(client): show not found for a missing workflow run | `views/settings-workflows/ui/SettingsWorkflowsView.test.tsx`, `widgets/page-state/ui/QuerySection.test.tsx` |
| U-36 (S-m18) bare `/o/:id/settings` opens the first readable section | fixed | `a03ec705` feat(client): open the first readable section at the bare settings path | `views/settings-index/ui/SettingsIndexView.test.tsx`, `shared/lib/router/route-paths.test.ts`, `app/apps/desktop/src/route-tree.test.tsx` |
| U-36 (S-p5) unknown tail under a section without detail pages → not found | fixed (desktop); already fixed on web | `9b1056c8` fix(desktop): show not found for a tail under a settings section | `app/apps/desktop/src/pages/section-views.test.tsx`, `app/apps/web/src/client/section-pages.test.tsx` |
| — decision 0051 and follow-up 94 | docs | `4ccab310` | — |
| — lint fixes | style | `a3c8787d` | — |

## Notes

- `GET /v1/me` now does one membership read when a last organization is stored, fail-closed like
  every membership check (a reader error fails the call). The users doc is not rewritten.
- A deleted project inside a live organization still lands on not-found from `/`; the page now
  offers "Ver organizações", so it cannot loop.
- `DataTable` errors do not use `ApiErrorState` yet, so they do not offer "sign in again" (B8).
- `RunPage.tsx` changes are limited to the not-found state; B7 (U-57) can build on it.

## Checks (integrated tree)

See the implementer report: client, services (unit), web and desktop unit tests; typecheck and lint
of the four packages; `pnpm i18n:check`; framework check. Contracts unchanged (no
`contracts:check` needed).
