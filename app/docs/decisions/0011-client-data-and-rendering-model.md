# 0011. Client data and rendering model

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/client` (`@core/client`), `app/apps/web`, `app/apps/desktop` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Refines:** SP2 spec `docs/superpowers/specs/2026-09-29-sp2-app-shell-ui-design.md` §2; umbrella spec §6 and D8 (product mutations only through `/v1`)

## Context

The user area runs in two hosts: web (Next 16, App Router, RSC, Cache Components) and desktop (Tauri 2 + Vite, no server). Both must show the same screens with the same behavior. `rules/state-management.md` requires one source of truth per piece of state and forbids server state in client stores (§2, §3). The framework's default for Next is "prefer Server Components for server data" (§3), but the desktop app has no server, and `/v1` only accepts `Authorization: Bearer` (umbrella §16.2), never the web session cookie.

## Decision

1. **Views are client components in `@core/client`, shared by both apps.** FSD layers under `packages/client/src` (`app-shell`, `views`, `widgets`, `features`, `entities`, `shared`), as in SP2 spec §2.1. The apps only compose and implement ports (`router`, `session-bridge`, `secure-store`, `platform`).
2. **Server state lives only in TanStack Query** (`@tanstack/react-query`), fed by `/v1` with `Authorization: Bearer <Firebase ID token>` through a caller typed by SP1's endpoint descriptors (`callEndpoint`). Query keys are scoped by organization; mutations invalidate them. No server data in Zustand, Context or module variables.
3. **Web RSC is thin:** locale segment, `<html lang dir>`, session guards (`requireWebSession()`, `requirePlatformStaffSession()`), metadata, and the `<Suspense>` boundary around request-time parts. RSC does not fetch product data for views.
4. **Server Actions exist only for the web session** (`createSession`, `exchangeSession`, `signOut`, SP1 decision 0007). Every product mutation goes through `/v1`.
5. **Client global state** is limited to UI preferences without server origin (command palette recents) in one small Zustand store with `persist` and a `reset`. Theme goes through `next-themes` in both apps. The URL holds organization, project, unit, tabs, filters and cursors (§6 of the rule).
6. **Boundaries:** `@core/client` imports only `@core/contracts` and `@core/i18n` (lint, `packages/config/eslint/boundaries.js`). Platform specifics enter through ports.

## Consequences

- One implementation of every screen; web and desktop differ only in adapters (SP2 spec §2.2).
- Web pages render their data on the client after the session exchange, so first paint of the user area shows skeletons. Acceptable for an authenticated app shell; public pages (sign-in) stay light.
- The rule's preference for Server Components is deliberately not applied to product data: this is the deviation this decision records. It is justified by the desktop host and the Bearer-only `/v1`.
- Caching follows TanStack Query defaults set in `shared/api/query-client.ts` (`staleTime` 30 s, no retry on 4xx; SP2 Task 8).

## Alternatives rejected

- **RSC fetches data and passes props on web, TanStack Query on desktop.** Two data paths per screen, and RSC would need the cookie to reach `/v1`, which accepts only Bearer.
- **Server Actions for product mutations on web.** Breaks umbrella D8 and duplicates `/v1` for one host.
- **A global client store (Zustand) caching API responses.** Forbidden by `rules/state-management.md` §3.
