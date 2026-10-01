# 0012. Routing: URL scheme, router port, locale segment on web, modules under `/m/:moduleId`

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/client/src/shared/lib/router`, `app/apps/web/src/app/[locale]`, `app/apps/desktop/src/routes` (local decision; the framework is unchanged)
- **Refines:** SP2 spec §4; umbrella spec §6 ("um port em `shared/lib/router`, com adapter Next e adapter TanStack Router")

## Context

Shared views must navigate without importing `next/*` or `@tanstack/*`. The web uses the App Router with a locale segment; the desktop uses TanStack Router file routes without a locale. Modules must add screens without adding route files to either app, because the list of installed modules lives only in the apps and the core never imports a module (umbrella D6).

## Decision

1. **One route map** in `shared/lib/router/route-paths.ts`, keyed by route id (`sign-in`, `invite`, `home`, `organizations`, `organization`, `project`, `module`, `settings`, `settings-module`, `profile`, `admin`) with the paths of SP2 spec §4. It builds and parses hrefs; both adapters use it. The web adds `/{locale}` in front of every path; the desktop does not.
2. **Router port** (`router-port.ts`): `href(route)`, `navigate(route, { replace })`, `Link`, `useRouteParams()`, `useSearchParam(name)`, `useLocationPath()`. Views and widgets use only this port. Web adapter: next-intl `createNavigation` (locale-prefixed `Link`, `useRouter`, `usePathname`) plus `useParams`/`useSearchParams`. Desktop adapter: TanStack Router (`Link`, `useNavigate`, `useLocation`, `useParams`). Tests use an in-memory router.
3. **URL owns navigation state:** organization and project are path segments (`/o/:organizationId/p/:projectId`); unit, tabs, filters and cursors are search params (`?unit=`). Nothing of this is duplicated in a store.
4. **Modules never add route files.** The catch-all `module` route (`/o/:organizationId/p/:projectId/m/:moduleId/*`) resolves the page from the client module registry (`pages: { "": ListPage, "items/:id": DetailPage }`), lazily loaded. Module settings use `/o/:organizationId/settings/m/:moduleId`.
5. **Guards:** the web guards sessions on the server (`requireWebSession()` in the `(app)` layout, `requirePlatformStaffSession()` in `/admin`); the desktop guards in the root route from the session state. Permission checks inside a page use `can()` from `GET /v1/me/context`. A 404 from `/v1` renders `not-found`; a 403 renders `forbidden`. `/admin` exists only on web and answers 404 to non-staff.
6. **Organization switch:** navigate to `/o/:id`, `PUT /v1/me/active-organization`, force `getIdToken(true)`, invalidate queries. `lastContext` is written by the server (SP1).

## Consequences

- Adding a route means a route-map entry, a view slice and one thin route file per app; adding a module page means nothing in the apps.
- A route-tree test (SP2 Task 20) checks that every route id has a desktop route except `admin`; `route-paths.test.ts` checks the href round trip for every id.
- Module deep links survive a module upgrade only if the module keeps its page keys stable; this is part of the module contract (decision 0015).

## Alternatives rejected

- **Views import `next/navigation` and a desktop shim of it.** Couples shared code to one framework and breaks the desktop typecheck.
- **Route files per module page.** Every module install would edit both apps.
- **Locale in the desktop URL.** The desktop has one window and a profile preference; a URL segment adds nothing there.

## Outcome of SP2 Tasks 12–13 (2026-09-30)

- **Invitation links keep the token in the fragment only.** `/invite#token=` is read once on mount and removed from
  the address bar (`history.replaceState`). A signed-out visitor signs in on the invitation page itself instead of
  being redirected to `/sign-in?next=`: the redirect would either lose the token or copy it into a query string that
  reaches server and proxy logs (SP1 spec §6.2). After an email mismatch, "sign in with another account" signs out
  and stays on the page, so the token (still in memory) can be accepted by the right account.
- **`?next=` after sign-in** is honoured only when it parses as a route of the map (`parseRoute`), never an external
  origin, `//host` or an entry page (sign-in, invite); anything else lands on home.
- **Guards inside pages:** the module page renders forbidden when the navigation item that opens it needs a
  permission the viewer lacks at the node, and not-found for an unknown module or page key; pages whose main read
  answers 404 render not-found, 403 forbidden (`widgets/page-state` `QueryPage`).

## Outcome of SP2 Tasks 18–19 (2026-09-30)

- **Web adapter** (`apps/web/src/client/web-router-adapter.tsx`): hrefs and params come from the route map (`routeHref`/`parseRoute`) over `next/navigation`'s pathname with the locale segment stripped; links are next-intl's `Link`, navigation next-intl's `useRouter` handed to the port by `WebRouterBridge` (a layout effect). next-intl's `usePathname` is not used: the shell reads the route node while it builds the intl provider, and that hook needs the provider.
- **Request-time client tree.** The shell reads `?unit=` (search params) at the root to pick the display time zone, so the root layout renders the client tree under `<Suspense>` after `connection()`; the static shell per locale is the document plus a translated loading status.
- **Guards.** `(app)/layout.tsx` and `admin/layout.tsx` call the SP1 guards inside `<Suspense>`; sign-in keeps `?next=` from the `x-request-path` header the proxy forwards. A signed-out visit to `/admin` is sent to sign-in (SP1 guard `redirect`); a signed-in non-staff user (or staff without MFA) gets `notFound()`. Because the guard runs in a streamed segment, the HTTP status is 200 with the not-found page and `noindex` (Next streaming behaviour), exactly like any unknown path under a locale (`[locale]/[...rest]`), so `/admin` stays indistinguishable from a missing page.
