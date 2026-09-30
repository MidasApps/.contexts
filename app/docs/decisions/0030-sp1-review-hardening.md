# 0030. SP1 review hardening: rate limits, client IP, grant races, unit tree lock, idempotency secrets, owner hierarchy

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/services/src/services/{shared/http,shared/rate-limit,shared/idempotency,access,tenancy}`,
  `app/packages/contracts/src/contracts/{access,tenancy}/endpoints.ts` (local decision of the boilerplate; the
  framework in `.contexts/` is unchanged)
- **Refines:** decision 0009 (rate limits, idempotency), decision 0006 (tenancy and access model), SP1 spec §5.3,
  §6.1, §7.2; source: the review of SP1 Tasks 7–10

## Context

The review of SP1 Tasks 7–10 found gaps where a race, a crash or a forged header opens access or leaks a secret.
Each item below is a policy choice; the code comments point here.

## Decision

1. **Failure-counted rate limits reserve first.** `device-redeem` and `api-key-failure` used to peek before the work
   and count after it, so a parallel burst passed the check before any failure was counted. The pipeline now
   consumes a slot before the work for every policy and, for failure-counted ones, refunds it when the work
   succeeded (`RateLimiter.refund`, same window only). A work that throws keeps its slot (fail-closed). A burst of
   legitimate calls may briefly see `429`; these endpoints are low volume.
2. **Client IP behind trusted proxies only.** The per-IP subject is the `X-Forwarded-For` entry appended by the
   outermost trusted proxy: the `TRUSTED_PROXY_HOPS`-th entry from the right (services env, `0..5`, default `1` for
   App Hosting / Cloud Run behind Google's front end; `2` with an external HTTPS load balancer in front).
   `X-Real-IP` is never read. A header shorter than the trusted chain, or `0` hops, maps to the shared `unknown`
   bucket, never to a client-chosen value. Follow-up 19 verifies the hop count in the first remote environment.
3. **Grant transactions re-read the organization; project deletes cascade.** `authorize()` runs before a grant
   transaction, so every grant change (grant, update, revoke, member removal, invitation acceptance) now reads
   `organizations/{id}` inside its transaction (`OrganizationGuard`) and aborts with `404` when it is gone: the read
   conflicts with the delete's write, and a deleted organization never gets a live grant or an un-revoked
   projection. `createOrganization` skips it (the organization is created in the same transaction). For projects we
   chose **cascade** over a Rules check of the parent project: deleting a project soft-deletes its units first, in
   rounds of 400, then the project; Rules and queries never see a unit that outlives its project, and a retry after
   a crash finishes the units. `authorize()` already denies a unit whose project is deleted.
4. **Unit tree lock per project.** A move or subtree delete rewrites descendants in batches before its final
   transaction. It now holds `unit-tree-locks/{projectId}` (`lockId`, the operation, a 2-minute lease): a second
   move or delete answers `409 CONFLICT`; unit creation answers `409` while the lock is held (a new unit would copy
   a stale parent path); renames update the unit as read in their own transaction and are never blocked. The final
   transaction commits only while the lock is still its own and the unit's tree fields are unchanged, and frees the
   lock atomically with the write. A retry of the same operation takes the lock over and heals (re-planning rewrites
   only stale units). After the lease, the next tree change first finishes the abandoned operation as `system`
   (audited `UNIT_MOVED` / `UNIT_DELETED`); a move whose target was deleted meanwhile heals in place.
5. **Idempotency never replays secrets.** Successes of endpoints that return a one-time secret
   (`ONE_TIME_SECRET_ENDPOINT_IDS`: invitation link, API key, activation code, desktop session and exchange, device
   redeem, impersonation token) are stored without body; a replay answers `409 CONFLICT` with `Location` and
   `Idempotent-Replayed: true` (the resource exists, the secret is gone). Their errors are stored as usual. An
   impersonated request is scoped by its session (`user:<uid>:imp:<sessionId>`), so staff never replays the user's
   own results. `complete` and `release` take the attempt id `begin` returned and do nothing once a later attempt
   took the lease over. A replayed error envelope carries the replaying request's `requestId`.
6. **Owner hierarchy.** Changing, revoking a grant or removing a member requires the target's current permissions ⊆
   `effective(actor, grant node)` (403 `ESCALATION_FORBIDDEN`), the same rule as granting (SP1 spec §5.3). Owners
   hold every tenant permission, so only owners change or remove owners; an admin keeps managing members, viewers
   and other admins. The last-owner guard still applies to owners.
7. **Grantees must exist.** A user grant requires the grantee's `users/{uid}` doc (404 `NOT_FOUND`), unless the grant
   creates it (organization owner, accepted invitation).

## Consequences

- New server-only collection `unit-tree-locks` (Security Rules deny it by default); new env `TRUSTED_PROXY_HOPS`.
- Endpoint descriptors: `createUnit`, `updateUnit`, `deleteUnit` declare `409 CONFLICT`; `revokeMembership` and
  `removeMember` declare `403 ESCALATION_FORBIDDEN`; OpenAPI regenerated.
- A crashed move blocks tree changes of its project for at most the lease (2 min), then heals itself.

## Alternatives considered

- **Rules check of the parent project** instead of the cascade: one more `get()` per unit read and a deleted
  project's units still returned by server queries; rejected.
- **Idempotency disabled** for secret endpoints: a retried POST would create a second key/invitation; the redacted
  record keeps "at most once" and tells the client the resource exists.
- **Per-unit `moveInProgress` markers** instead of a project lock: every read of the tree would have to check
  ancestors for markers; the project lock is one document and matches the batch scope of a move.

## Amendments

- **A1 — 2026-09-30 (review of SP1 Tasks 13–15): the `device` system role reads its context.** A device granted
  only the `device` role got `404` from `GET /v1/me/context`, which authorizes `core.organization.read` at the node.
  `core.organization.read` now lists `device` among its default roles (SP1 spec §5.1 table: owner, admin, member,
  viewer, **device**); no other core permission does. Modules still give `device` their own permissions. A device
  granted at a project reads its context there (authorization inherits downwards), never the organization's other
  projects.
- **A2 — 2026-09-30 (same review): redeeming a device activation re-checks its creator.** Like an invitation, an
  activation must not outlive its creator's right to grant it. Inside the redeem transaction, after re-reading the
  activation, `checkGrantable` runs for the creator (`core.device.create` at the activation's node, custom roles live,
  roles within the creator's current permissions) on a fresh request scope, so every transaction attempt re-reads
  the grants. A denial refuses the code with the same `401` (logged reason `CREATOR_CANNOT_GRANT`); a reader error
  aborts the transaction (fail-closed, `500`). `authorize()` reads are not transactional reads, so a demotion that
  commits while the redeem transaction runs may still let that one redeem through; the window is one transaction,
  and the demoted admin's pending codes stop working afterwards.
- **A3 — 2026-09-30 (SP1 Task 19, report concern 5 of Tasks 16–18): an interrupted approval stays `approved`.**
  Execution is at-most-once. A crash between the approve transaction and the execution record leaves the request
  `approved`, and nothing may run its handler again: the handler may already have acted, and SP1 cannot tell.
  `approved` is transient, so any request that keeps it is either executing or interrupted.
  - **Visible now:** `GET /v1/organizations/{organizationId}/approval-requests?status=approved`
    (`core.approval.read`) lists these requests with `decidedBy`, so an operator can check the action's effect and
    act by hand. A unit test pins this state: the approval is listed, a second approval answers `409` and the
    handler ran once.
  - **Sweep for SP5 (follow-up):** a scheduled job, of the same kind as SP5's workflow scheduler, marks requests
    that are still `approved` more than 15 minutes after `updatedAt` as `failed`, with `errorCode:
    EXECUTION_INTERRUPTED`, and writes an `APPROVAL_FAILED` audit entry in one transaction per request. It never
    re-executes a request. The job reads across tenants (`status == approved`, `updatedAt <`), so it needs a
    platform-scope composite index `approval-requests status+updatedAt`, declared together with the job.
  - **Handlers that must not act twice** keep their own idempotency key in the action input (SP3:
    `runId:toolCallId`), so an operator's manual retry stays safe.
- **A4 — 2026-09-30 (SP1 Task 19): Security Rules deny impersonated tokens and keep one `get()`.**
  - An ID token with the `imp` claim reads no document directly. Impersonation is read-only, time-boxed by the
    session doc and audited per request, and only `/v1` enforces those three checks (SP1 spec §6.6). A direct
    Firestore read would skip them.
  - Rules read only the access projection (`get()` of `access/{token.tenantId}_{uid}`). A suspended organization
    therefore stays readable to its members through direct reads of its organization, projects and units, while
    `/v1` answers `ORGANIZATION_SUSPENDED`. The cost is the same as a parent check (one more `get()` on every read),
    and a suspension hides nothing secret from the organization's own members, so we keep the gap. Deleting an
    organization revokes its projections (`isRevoked`), and project deletes cascade to units (§3), so soft deletes
    need no second read.
- **A5 — 2026-09-30 (follow-up #22): any live grant in the organization lets its holder switch to it.**
  `PUT /v1/me/active-organization` used to authorize `core.organization.read` at the organization. Grants inherit
  only downwards, so a user whose only grant sits on a project or a unit was refused, got no `tenantId` claim, and
  could not use a UI keyed on the active organization nor read directly what its grants allow.
  - **Check.** The caller must be a live member: `requireOrganizationMember` (access context) reads the caller's
    live grants in that organization from the source of truth (`memberships`), never from the access projection,
    and accepts the first grant node, organization first, where `getEffectivePermissions` succeeds (live node
    chain, active organization, active user). Any role qualifies, custom roles included. A grant on a deleted
    project or unit, a revoked grant, a suspended organization or a disabled user is refused. It checks at most
    50 distinct nodes. A reader error rejects (`500`), never allows. Impersonation is still refused first. Without
    any live grant, the answer stays `404`.
  - **Switching grants nothing.** The claim is a projection for Security Rules, and the Rules already scope a
    member to its access projection (`visibleProjectIds`, `unitIds`). `/v1` keeps authorizing every node. So a
    project-only member still gets `404` from `GET /v1/me/context?organizationId=…` at the organization level; the
    UI asks for the context at the member's project or unit.
  - `GET /v1/me/organizations` already listed such organizations (it pages the live projections); a test pins it.
    The local seed now also sets the active organization of `member@demo.local`.
  - **Alternative rejected:** the live access projection (`isRevoked == false`) alone. It is a read model, and it
    stays live for a grant whose project was deleted since.
- **A6 — 2026-09-30 (follow-up #21): the core registers one neutral unit type, `core.unit`.** SP1 spec §4 said
  the core registers none, so the local seed declared its own `seed.unit`. An app that does not install that type
  answered `422` when a seeded unit was moved. `createTenancyServices` now always registers `CORE_UNIT_TYPES`
  before the modules' types: `core.unit` (label `common.unitTypes.unit`, allowed under `project` and under
  `core.unit`). `core` is a reserved module id, so no module can redeclare it. The seed uses `core.unit` and
  installs no module. `GET /v1/unit-types` lists it for every app.
- **A7 — 2026-09-30 (follow-up #33 and SP1 follow-ups report concerns 2–3): the caller's grant nodes, and lists
  that agree with them.**
  - **`GET /v1/me/grants?organizationId=…`** (`identity.listMyGrants`, contract `access.MyGrant`) lists the live
    nodes where the signed-in user holds grants in that organization: `{ node, roles }`, one item per node with
    the roles of its grants merged, widest first (organization, project, unit), cursor-paged. A node counts
    when `getEffectivePermissions` accepts it there, the same check as A5 (`listLiveGrantNodes` in the access
    context, at most 50 nodes), so a grant on a deleted project or unit is skipped. It is self-only: it reads
    the caller's own grants and needs no permission. Without any live node it answers like the switch: `404`,
    or `403` for a suspended organization or a disabled user. The client uses it to land a member whose
    organization-level context is `404` on its widest node, a unit included.
  - **`GET /v1/me/organizations`** now keeps an organization only while the caller passes
    `requireOrganizationMember` there; a suspended organization stays listed (switching answers `403`). The
    access projection stays live for a grant whose project was deleted since, so it no longer decides alone. A
    page may hold fewer items than its limit.
  - **`GET /v1/me/context`** reads only the regional preferences of the users doc, leniently: a doc without
    `preferences` (or with unreadable ones) resolves with the node's settings instead of answering `500`.
