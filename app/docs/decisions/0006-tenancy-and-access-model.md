# 0006. Tenancy and access model: set-based tenancy, node inheritance, projections

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/services` (contexts `tenancy`, `access`, `identity`), `app/packages/contracts`,
  `app/firestore.rules` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Stands in for:** `.contexts/engineering/rules/tenancy.md`, which `contracts/firebase-firestore.md` §7 requires
  when a product uses set-based tenancy. The framework is read-only for this app, so the model is recorded here and
  wins over §7's single-claim default for this app only.
- **Refines:** SP1 spec `docs/superpowers/specs/2026-09-29-sp1-identity-tenancy-rbac-design.md` §4, §5

## Context

`contracts/firebase-firestore.md` §7 assumes one `tenantId` claim per token. The core needs more: one user belongs
to several organizations, access is granted per node of a tree (organization → project → unit tree typed by the
application), and devices and API keys act inside one tenant. §7 asks such products to document the model and keeps
three invariants that do not change: the effective tenant is server-bound, claims are a projection of the source of
truth, and a resource without a tenant mapping is denied.

## Decision

1. **Tenant = organization.** `organizations/{id}` has `tenantId == id`. Every tenant-scoped document in a
   top-level collection (`projects`, `units`, `roles`, `memberships`, `access`, `invitations`, `devices`,
   `device-activations`, `api-keys`, `approval-requests`, `audit-logs`) carries `tenantId`, and every query and
   composite index on them starts with `tenantId` (or with a key that is already tenant-bound, such as a principal).
2. **Set-based membership.** A principal (`user` or `device`) holds grants in any number of tenants. A grant is a
   `memberships` document on one node (`organization`, `project` or `unit`) with 1–10 `RoleRef`s. Grants inherit
   downwards along the node chain: organization → project → unit ancestors (root first) → unit. There are no deny
   rules (umbrella D9).
3. **Source of truth vs projections.**
   - Source: `memberships`, `roles`, `devices`, `api-keys`, `platform-staff`, and the node documents.
   - `access/{tenantId}_{principalId}` is a projection of the principal's grants (`orgWide`, `projectIds`,
     `unitIds`, `visibleProjectIds`, `isRevoked`, `version`), rebuilt inside the same transaction as every
     membership change. Only Security Rules and list screens read it.
   - Custom claims (`tenantId` = active organization, `platformRole`, `accessVersion`) are a projection of the
     users doc, the active organization's access doc and the staff doc. They are written with
     `setCustomUserClaims` after commit and healed by `POST /v1/me/claims/sync`. A claim never grants anything.
4. **Invariants (from §7, kept):**
   - *Tenant is server-bound.* Every `/v1` tenant route names its organization in the path or through the resource
     it loads; `authorize()` loads the node chain from Firestore and checks that the tenant ids agree. A `tenantId`
     in a body is accepted only after this cross-check. The active-organization claim is a UI convenience, never an
     input to an access decision on the server.
   - *Claims are a projection.* `authorize()` reads the source (memberships, roles, devices, API keys, staff docs),
     never claims and never the access projection.
   - *Unmapped resource is denied.* A permission not in the registry, a node that does not resolve, a soft-deleted
     node, a suspended organization, a scope mismatch or an unexpected reader error all deny. Errors propagate as
     500; they never become "allowed".
5. **Security Rules are defense in depth.** Clients never write. Reads are allowed only for `users/{uid}` (self),
   the caller's access doc of the active tenant, and `organizations`, `projects`, `units` of the active tenant
   visible through that access doc (one `get()` per evaluation). The web and desktop read through `/v1`.
6. **Timestamps.** Firestore stores `Timestamp`; wire contracts use ISO 8601 strings (`IsoDateTimeSchema`). The
   conversion happens only in the Firestore adapter (`services/shared/firestore/contract-converter.ts`), which also
   parses every read with the entity contract and fails with `CorruptDocumentError` instead of returning bad data.
7. **Platform scope.** Permissions with `scope: "platform"` apply only to `{ level: "platform" }` nodes and require
   an active `platform-staff/{uid}` doc and MFA. Staff read tenant data only through read-only, time-boxed,
   audited impersonation.

## Consequences

- Every membership write is a transaction that also rebuilds one projection and bumps `users.accessVersion`; grant
  changes are low volume, so the cost is accepted.
- A user whose claims are stale still gets correct `/v1` answers (the API reads the source). Only direct client
  reads (Rules) can lag, until the client refreshes its token after `GET /v1/me` reports a newer `accessVersion`.
- Rules helpers `isMember`, `canSeeProject`, `canSeeUnit` depend on the projection shape; changing it needs a rules
  change and a migration (`rules/migration.md`).
- Moving a unit rewrites `ancestorIds` of its subtree (≤ 500 units) and rebuilds affected projections.

## Alternatives rejected

- **`tenantIds[]` claim as the access list.** The 1000-byte claims limit caps the number of tenants and nodes, and
  claims lag behind revocations until the token refreshes.
- **Subcollections under `organizations/{id}`.** Collection-group queries across tenants (my organizations, staff
  views) get harder and the doctrine prefers top-level collections for shared entities (§3).
- **Authorize from the projection or claims.** Faster, but a projection bug would grant access; the source-read
  path keeps the projection a pure read model.
