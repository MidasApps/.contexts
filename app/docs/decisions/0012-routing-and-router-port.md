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
