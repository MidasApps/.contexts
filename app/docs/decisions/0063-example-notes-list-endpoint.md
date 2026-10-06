# 0063. The example module lists its notes over `/v1` and drops "Record item"

- **Status:** accepted
- **Date:** 2026-10-03
- **Scope:** `app/modules/example` (`contracts/note-endpoints.ts`, `server/example-routes.ts`, `server/note-repository.ts`, `server/note-use-cases.ts`, `ui/ExampleNotesCard.tsx`, `ui/ExampleHomePage.tsx`), `app/apps/web` (`src/server/modules.ts`, `core.ts`, `runtime-routes.ts`, `src/app/v1/organizations/[organizationId]/notes/route.ts`), `app/packages/services` (public exports), `app/packages/contracts` (catalog scripts), `app/catalog.modules.ts`, `app/firestore.indexes.json` (local decision; the framework is unchanged)
- **Refines:** decisions 0015 (module contract), 0025 (module commands); follow-up #38

## Context

SP3 Task 19 gave the example module note commands (agent tools, four-eyes archive, a workflow)
over Firestore `notes`, but nothing read the notes back: `example.note.read` guarded nothing and a
user saw a note only in the audit log. The module page also had a "Record item" button that only
showed a toast ("nothing was saved").

`defineModule()` is data only and has no field for endpoints. The seams that existed were the
web app's module composition file (`createModuleCommands`), the `endpointIds` option of
`createRouteResolver` and the `extra` endpoints of `composeCoreEndpoints`. None was wired yet.

## Decision

1. **Endpoint.** `GET /v1/organizations/{organizationId}/notes` (`example.listNotes`) is declared
   in the module's contracts with `defineEndpoint` (`EXAMPLE_ENDPOINTS`). It takes `?cursor&limit`
   and answers `{ data, meta.page }`, newest first, archived notes included.
2. **Authorization.** `makeListNotes` checks `example.note.read` at the organization node: notes
   belong to the tenant, not to a project. A caller with no grant in the organization gets 404, one
   without the permission 403 (`deniedResponse`). Reads are not audited.
3. **Storage.** The Firestore repository queries `tenantId ==` ordered by `createdAt desc,
   __name__ desc` with the core cursor (`[createdAt, id]`). The composite index `notes tenantId +
   createdAt desc` is in `firestore.indexes.json`. The in-memory repository keeps the same order
   and cursor.
4. **Wiring.** The module exports `createExampleRoutes(deps & { pipeline })` from `./server`; the
   handler runs in `withApiRoute`. The web app's `src/server/modules.ts` adds `createModuleRoutes`
   and `MODULE_ENDPOINT_IDS`: `runtime-routes.ts` spreads the routes and `core.ts` passes the ids to
   `createRouteResolver`. The route file only calls `route("example.listNotes")`. To keep the
   module on the core's public API, `@core/services` now exports `pageRequestOf`, `listResponse`,
   `invalidCursorResponse`, `deniedResponse` and `pageFromOverfetch`.
5. **Catalog.** An entry of `catalog.modules.ts` may list `endpoints`; `contracts:catalog` and
   `contracts:check` add them to `docs/openapi/v1.yaml` through `composeCoreEndpoints(extra)`. Ids
   must carry the module prefix, like contracts.
6. **Page.** The module page shows a notes card: skeleton, error with retry, no-access on 403, an
   empty state that says notes come from agents, workflows or the chat, and "Load more" for the
   next cursor.
7. **"Record item" is removed.** No `/v1` path runs `CreateNoteCommand` directly: it runs through
   the agent tool pipeline, approvals and workflows. Wiring the button would mean a new create
   endpoint with idempotency and a form, for an action the chat already offers. The page now reads
   only, and says where notes come from.

## Consequences

- A module that serves `/v1` endpoints adds them to `EXAMPLE_ENDPOINTS`-style lists, the web
  composition file, a route file and `catalog.modules.ts` (README, "Creating a module").
- A project-only member cannot read notes, as for the module settings card (organization-level
  reads).
- The page no longer demonstrates a permission-gated write button; the settings card still links
  to the settings form for `example.item.write`.
- The core index test lists the `notes` collection by name, because the core never imports a
  module.

## Alternatives rejected

- **An `endpoints` field in `defineModule()`.** The manifest is data loaded on the client and by
  the agent runtime; handlers need server dependencies. The composition file already owns that.
- **Keeping "Record item" and adding `POST .../notes`.** More surface than the follow-up needs,
  and a second create path next to the command registry.
- **Leaving module endpoints out of the OpenAPI.** The registry already accepted extra
  endpoints; a public `/v1` route missing from the spec breaks the "OpenAPI from Zod" rule.
