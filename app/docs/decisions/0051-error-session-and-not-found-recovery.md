# 0051. Error, session and not-found recovery

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/services` (identity `GET`/`PATCH /v1/me`), `app/packages/client`
  (route map, page states, error states, settings index, server error view), `app/apps/web`
  (`[locale]/error.tsx`, `global-error.tsx`, settings index page), `app/apps/desktop` (settings
  index route, settings section page)
- **Refines:** SP2 spec §4 (routes, page states), decision 0012 (routes), decision 0013 (i18n)
- **Source:** UX review 2026-10-01, batch B3: U-06 (SH-05), U-07 (SH-06), U-21 (SH-09), U-36
  (S-m6, S-m18, S-p5)

## Context

Several dead ends shared one cause: the UI offered a way on that could not work. `/` redirects to
`users.lastContext`, which keeps an organization the user was removed from, and the not-found page
there only offered "go home", which redirects back. A 401 that survives the forced token refresh
showed "try again", which keeps failing. Server render errors showed Next's English default
screen. A missing workflow run read as a retryable error, and the bare `/settings` address had no
page.

## Decision

1. **`/v1/me` answers a live `lastContext` only.** `describeMe` (shared by `GET` and `PATCH`)
   checks `requireOrganizationMember` for `lastContext.organizationId` and answers `{}` when the
   caller is no longer a live member (removed, organization deleted or suspended). The users doc
   is not rewritten: `GET` stays safe, and the next organization switch rewrites it. The check is
   fail-closed like every membership check, so a reader error fails `/v1/me`; it costs one
   membership read per call with a stored organization. Projects are not checked (nothing writes
   `projectId` today); the not-found page covers that case (item 2).
2. **Not-found also offers the organization list.** `PageNotFound` links to "home" and to
   `/organizations`, which never redirects, so no not-found page can loop.
3. **A lost session offers "sign in again".** `ApiErrorState` and `PageError` treat an `ApiError`
   with status 401 as a lost session (the HTTP client already refreshed the token once): the action
   ends the local session (`session.signOut()`, failures ignored) and opens sign-in with `next` set
   to the current path and query. The session is not ended centrally in the HTTP client: a 401 on
   one background call should not sign the user out of a page that works.
4. **Server render errors use the design system.** `[locale]/error.tsx` renders the shared
   `ServerErrorView` (translated copy, `digest` as the reference, `retry()`, a way home; reports the
   error once). `app/global-error.tsx` replaces the document when the root layout fails: it imports
   the stylesheet, takes the locale from the path and loads the core catalogs itself, so even that
   page has no inline copy.
5. **Detail pages map 404 to not found.** `QuerySection` takes an optional `notFound` state for a
   404 or `null` data; the run page uses it with "back to runs", and the run read maps 404 to
   `null` (`nullOnNotFound`), like approvals and traces.
6. **`/o/:organizationId/settings` is a route.** The shared route map gains `settings-index`; its
   view opens the first section of the `settings` navigation slot the viewer can read (replacing
   the address), says forbidden when none is readable, and not found for a hidden organization.
   Both hosts serve it. The desktop settings page now reads the section from the shared route map
   like the web, so a tail under a section without detail pages is not found on both hosts.

## Consequences

- `GET /v1/me` does one more read when a last organization is stored; `lastContext` in the answer
  can differ from the users doc (documented on `getMe`). The contract shape is unchanged.
- Any query rendered through `ApiErrorState` or `PageError` gets the sign-in action for free;
  `DataTable` errors do not use them yet (UX review B8).
- No e2e forces a server render error yet (follow-up 94); the pages are unit-tested.

## Alternatives considered

- **Clear `lastContext` on member removal and organization deletion.** Needs writes in two use cases
  (and every future one that ends a membership) and still leaves existing stale docs; answering a
  checked value fixes all of them at read time.
- **Client pre-flight in `HomeView`** (read the access context before redirecting): one more
  request on every `/` visit and duplicate logic on each host; the server answer is cheaper.
- **Sign out centrally on any 401 in the HTTP client:** too broad (see decision 3).
- **Inline pt-BR copy in `global-error.tsx`:** would break the i18n rule for one page; loading the
  core catalogs costs only bundle size on an error page.
