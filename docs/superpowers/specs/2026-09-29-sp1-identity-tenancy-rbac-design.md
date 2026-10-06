# Spec — SP1 Identity, tenancy and RBAC

- **Status:** approved for planning (defaults chosen by the planner, recorded as app decisions 0006–0010)
- **Date:** 2026-09-29
- **Parent:** `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` (umbrella) §4, §16.2, §13 (SP1 gate)
- **Origin:** `docs/prompts/2026-09-29-agentic-app-core-harness.md` items 3, 10 (multi-tenant), 11 (`/admin` staff), decision 4 (tenancy)
- **Plan:** `docs/plans/2026-09-29-sp1-identity-tenancy-rbac.md`
- **Framework:** `.contexts/` and `.claude/` are read-only. Where the doctrine asks for a document the framework
  lacks (`rules/tenancy.md`, required by `contracts/firebase-firestore.md` §7 for set-based tenancy), SP1
  writes an app decision instead (`app/docs/decisions/0006-tenancy-and-access-model.md`).

---

## 1. Scope

SP1 delivers the backend of identity, tenancy and access control, exposed through `/v1`, plus the Firestore
Security Rules that guard direct client reads. It has no product UI (SP2 builds it) and no agent runtime (SP3).

In scope:

1. Principals: `user`, `device`, `service` (API key), `platform staff` (with MFA), staff impersonation (read-only).
2. Tenancy tree: organization (tenant) → project → optional unit tree typed by the application.
3. RBAC: permission registry, system roles, custom roles per tenant, grants per node inherited downwards,
   `authorize()` as the single decision function, agent permission ceiling (input for SP3).
4. Web and desktop sessions (session cookie, desktop session secret), active organization switch, claims projection.
5. Invitations, API keys, devices (activation codes), four-eyes approval requests, audit logs (tenant and platform).
6. Rate limiting and idempotency stores; endpoint descriptors in `@core/contracts` that also generate OpenAPI paths.
7. Follow-ups owned by SP1: #10 (`pnpm audit` advisories) and #12c (emulator host guard, defense in depth).

Out of scope (owner): profile/settings/admin UI (SP2 and SP5), `MastraAuthProvider` (SP3, consumes §10),
notifications and email delivery (later; SP1 exposes a port), explicit deny rules (umbrella D9), SSO/OAuth
providers other than email/password (later), BigQuery export of audit logs (SP5 / deploy).

## 2. Bounded contexts (`packages/services/src/services/<context>/`)

| Context | Owns |
|---|---|
| `identity` | users, platform staff, sessions (web/desktop), devices, device activations, API keys, principal resolution, token verification, impersonation sessions |
| `tenancy` | organizations, projects, units, unit-type registry, regional settings resolution |
| `access` | permission registry, system roles, custom roles, memberships (grants), access projection, claims projection, `authorize()`, invitations, approval requests |
| `audit` | audit writer (tenant and platform logs), audit log queries |
| `shared` | Firebase Admin client, Firestore helpers, HTTP API pipeline, rate limiter, idempotency store (no business rules) |

Each context follows `@.contexts/engineering/architecture/feature-based.md` + `hexagonal.md`
(`domain/`, `application/{ports,use-cases}/`, `adapters/{driving,driven}/`, `composition.ts`, `index.ts`).
Contexts talk through their `index.ts`; `access` is the only context that decides permissions.

## 3. Principals and authentication

### 3.1 Principal model (domain type in `services/identity/domain/principal.ts`)

```ts
type Principal =
  | { type: "user"; uid: UserId; mfa: boolean; impersonation?: { sessionId: ImpersonationSessionId; staffUid: UserId } }
  | { type: "device"; deviceId: DeviceId; tenantId: TenantId }
  | { type: "service"; apiKeyId: ApiKeyId; tenantId: TenantId; ownerUid: UserId };
```

Platform staff is not a principal type: it is a `user` whose uid has an active `platform-staff/{uid}` doc.
`mfa` is true when the verified token proves a second factor (§3.4).

### 3.2 `/v1` authentication (Bearer only)

`Authorization: Bearer <credential>`; cookies are never read by `/v1` (umbrella §16.2). The API pipeline
(`services/shared/http/api-route.ts`, §7) resolves the credential:

- Starts with the API key prefix (§6.3) → API key authenticator → `service` principal.
- Otherwise → Firebase ID token: `verifyIdToken(token, checkRevoked)`, where `checkRevoked = true` for every
  method except `GET`/`HEAD` (umbrella §16.2). Claims decide the principal: developer claim
  `principalType: "device"` → `device` (then `devices/{uid}` must be active); developer claim `imp` → user with
  impersonation (session must be active, §6.6); otherwise `user`.
- Missing/invalid/expired/revoked → `401 UNAUTHORIZED` (never 500). Tokens in the query string are ignored.

Unit tests cover the `checkRevoked` split with a fake verifier, because the Auth Emulator always checks
revocation (follow-up #12e; SP0 summary §1 gotcha 3).

### 3.3 Web session (Server Actions and RSC only)

Decision 0007. The web never persists Firebase tokens in web storage (`rules/security.md` §2):

1. The browser signs in with the Firebase JS SDK using `inMemoryPersistence` (email/password; MFA challenge when enrolled).
2. Server Action `createSession({ idToken })` (driving adapter `services/identity/adapters/driving/session-actions.ts`,
   wrapped by `apps/web/src/app/[locale]/(auth)/actions.ts` in SP2): verifies the token with `checkRevoked`, requires
   `auth_time` within 5 minutes, calls `createSessionCookie(idToken, { expiresIn })`
   (`SESSION_MAX_AGE_DAYS`, default 5, range 1–14), stores a `sessions` record (`kind: "web"`, `cookieHash =
   sha256(cookie)`, `mfa`), and sets cookie `__session` (`HttpOnly; Secure; SameSite=Lax; Path=/`). Next's Server
   Action origin check is the CSRF guard; the action also checks `Origin` against `NEXT_PUBLIC_APP_URL`.
3. On a new page load the Firebase SDK has no user. Server Action `exchangeSession()` verifies the cookie
   (`verifySessionCookie(cookie, true)`), loads the session record by `cookieHash` (must not be revoked), and returns
   `createCustomToken(uid, { smfa: <session.mfa> })`; the client calls `signInWithCustomToken` (in memory) and then
   uses its ID token as the `/v1` Bearer. The developer claim `smfa` carries the MFA proof because custom-token
   sign-in cannot carry a second factor (Firebase docs, TOTP MFA page).
4. RSC guard `requireWebSession()` (same adapter) runs in `(app)` and `/admin` layouts: cookie → verify →
   session record → principal; missing/invalid → redirect to `/login`.
5. `signOut()` marks the session record revoked and deletes the cookie. "Sign out everywhere"
   (`POST /v1/me/sessions/revoke-all`) also calls `revokeRefreshTokens(uid)`, which invalidates every session cookie,
   ID token and desktop exchange (desktop exchange re-checks `tokensValidAfterTime`).

### 3.4 MFA and platform staff

- Staff access requires an active `platform-staff/{uid}` doc **and** MFA: token `firebase.sign_in_second_factor`
  present (`"totp"` or `"phone"`), or `firebase.sign_in_provider === "custom"` with developer claim `smfa === true`.
- Factors: TOTP in remote environments (needs Identity Platform; enabled via `projectConfigManager` in the deploy
  runbook). The Auth Emulator supports SMS MFA only, so `local` uses SMS (codes read from the emulator REST
  endpoint in tests). `MFA_FACTORS` (`totp|phone`, list) is public config read by SP2's UI. Decision 0007.
- Staff roles: `platform-admin` (all `platform.*`), `platform-support` (`platform.*.read` + `platform.user.impersonate`).
- Bootstrap: `pnpm seed:local` (local) and `scripts/grant-platform-staff.ts` for remote projects, which requires
  `--project <id> --email <email> --confirm <id>` and writes an audit entry. No console edits.

### 3.5 Desktop session

Decision 0007. Desktop signs in with the Firebase JS SDK (in memory), then `POST /v1/me/desktop-sessions`
(Bearer) → `201 { data: { sessionId, secret, expiresAt } }`. The 256-bit `secret` is stored in the OS keychain
through SP2's `shared/lib/secure-store` port; the server stores only `sha256(secret)`. On start,
`POST /v1/desktop-sessions/exchange { secret }` (no Bearer; rate limited per IP) verifies hash, expiry (30 days,
sliding), revocation, user not disabled and session created after `tokensValidAfterTime`, rotates the secret and
returns `{ customToken, secret, expiresAt }`. Reusing a rotated secret revokes the session (theft signal, audited).

## 4. Tenancy and data model (Firestore)

All collections are top-level, kebab-case plural, automatic IDs (ADR 0005), camelCase fields, audit fields
`createdAt/updatedAt/createdBy/updatedBy` (`Timestamp`), soft delete `deletedAt/deletedBy` where listed,
`schemaVersion: 1`. Wire contracts use ISO strings; the Firestore adapter converts `Timestamp` ↔ ISO and parses
every read with the entity contract (`services/shared/firestore/contract-converter.ts`).

| Collection | Key fields | Scope | Soft delete |
|---|---|---|---|
| `users/{uid}` | `email`, `displayName`, `photoUrl?`, `preferences {locale?, timeZone?, currency?, theme: system\|light\|dark, notifications {productUpdates: bool, securityAlerts: true}}`, `lastContext {organizationId?, projectId?, unitId?}`, `accessVersion` (int), `status active\|disabled` | user | no (disable) |
| `platform-staff/{uid}` | `role platform-admin\|platform-support`, `isActive` | platform | no |
| `organizations/{id}` | `tenantId` (= id), `name`, `status active\|suspended`, `defaults {locale, timeZone, currency}` | organization | yes |
| `projects/{id}` | `tenantId`, `name`, `description?`, `status active\|archived`, `settings {timeZone?, currency?}` | project | yes |
| `units/{id}` | `tenantId`, `projectId`, `parentUnitId\|null`, `ancestorIds[]` (root first), `depth` (≤ 6), `type` (registered), `name`, `settings {timeZone?, currency?}` | unit | yes |
| `roles/{id}` | `tenantId`, `name`, `description`, `permissions[]` (≤ 200, registered) | organization | yes |
| `memberships/{id}` | `tenantId`, `principalType user\|device`, `principalId`, `nodeType organization\|project\|unit`, `nodeId`, `projectId\|null`, `roles: RoleRef[]` (1–10), `grantedBy` | organization | yes |
| `access/{tenantId}_{principalId}` | projection (§5.4): `tenantId`, `principalId`, `principalType`, `orgWide`, `projectIds[]`, `unitIds[]`, `visibleProjectIds[]`, `isRevoked`, `version` | organization | no |
| `invitations/{id}` | `tenantId`, `email`, `nodeType/nodeId/projectId`, `roles`, `tokenHash`, `status pending\|accepted\|revoked\|expired`, `expiresAt` (7 d), `acceptedByUid?` | organization | no |
| `devices/{id}` | `tenantId`, `label`, node fields, `status active\|revoked`, `lastSeenAt` | organization | no |
| `device-activations/{id}` | `tenantId`, `codeHash`, node fields, `roles`, `label`, `status pending\|redeemed\|revoked`, `expiresAt` (10 min, TTL) | organization | no |
| `api-keys/{id}` | `tenantId`, `name`, `publicId` (unique), `secretHash`, `scopes[]`, node fields, `ownerUid`, `expiresAt` (required, ≤ 365 d), `lastUsedAt`, `status active\|revoked`, `revokedReason?` | organization | no |
| `sessions/{id}` | `uid`, `kind web\|desktop`, `secretHash` or `cookieHash`, `mfa`, `userAgent` (browser + OS family only), `expiresAt`, `lastSeenAt`, `revokedAt?` | user | no |
| `impersonation-sessions/{id}` | `staffUid`, `targetUid`, `tenantId`, `reason`, `expiresAt` (≤ 60 min), `endedAt?` | platform | no |
| `approval-requests/{id}` | `tenantId`, node fields, `permission`, `requestedBy {type, id}`, `action {kind, input, summary}`, `status pending\|approved\|rejected\|cancelled\|expired\|executed\|failed`, `decidedBy?`, `reason?`, `expiresAt` (7 d) | organization | no |
| `audit-logs/{id}` | `tenantId`, `occurredAt`, `action` (SCREAMING_SNAKE, past tense), `actor {type, id, onBehalfOf?}`, `target {type, id}`, `node?`, `outcome success\|denied`, `requestId`, `traceId?`, `changes?` (field names only) | organization | append-only |
| `platform-audit-logs/{id}` | same, `targetTenantId?` instead of `tenantId` | platform | append-only |
| `rate-limit-buckets/{sha256(key)}` | `count`, `windowStart`, `expiresAt` (TTL) | — | no |
| `idempotency-records/{sha256(principal+route+key)}` | `requestHash`, `state in-flight\|done`, `response {status, body}`, `expiresAt` (24 h, TTL) | — | no |

`RoleRef = { kind: "system"; key: "owner"|"admin"|"member"|"viewer"|"device" } | { kind: "custom"; roleId: RoleId }`.
Membership uniqueness per `(tenantId, principalId, nodeId)` is enforced in the create transaction.

**Unit types.** The core registers none. Applications declare them in module manifests (SP2 `defineModule`,
field `unitTypes: [{ id: "<module>.<type>", labelKey, allowedParents: ["project" | "<module>.<type>"] }]`). The app
composition passes them to `createTenancyServices({ unitTypes })`. `GET /v1/unit-types` lists them.

**Regional settings.** Resolved by `services/tenancy` use case `resolveRegionalSettings({ organization, project?,
unit?, user })`:
- `currency` = unit → project → organization (`defaults.currency`, required) — the default for *new* amounts.
- `nodeTimeZone` = unit → project → organization — used for calendar rules and schedules (SP5).
- `displayTimeZone` = user preference → `nodeTimeZone`; the client applies the browser as final fallback only when
  there is no tenant context (umbrella §6).
- `locale` = user preference → organization `defaults.locale`; the web URL segment wins at render time (SP2).

## 5. Access control

### 5.1 Permissions

Format `<module>.<resource>.<action>` (`PermissionSchema`). Declared as data (`PermissionDefinition` contract):

```ts
{ id: Permission; descriptionKey: string; kind: "read" | "write"; scope: "tenant" | "platform";
  requiresApproval?: boolean; defaultRoles: SystemRoleKey[] | PlatformRole[] }
```

Core catalog `CORE_PERMISSIONS` (`packages/contracts/src/contracts/access/core-permissions.ts`):

| Permission | kind | default roles |
|---|---|---|
| `core.organization.read` | read | owner, admin, member, viewer |
| `core.organization.update` | write | owner, admin |
| `core.organization.delete` | write | owner |
| `core.project.read` / `core.unit.read` | read | owner, admin, member, viewer |
| `core.project.create\|update\|delete`, `core.unit.create\|update\|delete` | write | owner, admin |
| `core.member.read` / `core.role.read` | read | owner, admin, member |
| `core.member.invite\|update\|remove`, `core.role.create\|update\|delete` | write | owner, admin |
| `core.api-key.read` | read | owner, admin |
| `core.api-key.create\|revoke`, `core.device.create\|revoke` | write | owner, admin |
| `core.device.read` | read | owner, admin |
| `core.audit-log.read` | read | owner, admin |
| `core.approval.read` | read | owner, admin, member |
| `core.approval.decide` | write | owner, admin |
| `platform.organization.read`, `platform.user.read`, `platform.audit-log.read` | read | platform-admin, platform-support |
| `platform.user.impersonate` | write | platform-admin, platform-support |
| `platform.staff.manage` | write | platform-admin |

Modules add permissions through their manifest; the registry rejects duplicates and ids outside the module's
own prefix. System role `owner` holds every tenant permission of the registry (including module ones); `admin`
every tenant permission except `core.organization.delete`; `member`/`viewer`/`device` hold what the definitions list.

### 5.2 `authorize()` — the only decision function (fail-closed)

`packages/services/src/services/access/application/use-cases/authorize.ts`:

```ts
type NodeRef =
  | { level: "platform" }
  | { level: "organization"; tenantId: TenantId }
  | { level: "project"; tenantId: TenantId; projectId: ProjectId }
  | { level: "unit"; tenantId: TenantId; projectId: ProjectId; unitId: UnitId };

type AuthorizeRequest = {
  principal: Principal;
  permission: Permission;
  node: NodeRef;
  ceiling?: ReadonlySet<Permission>; // agent permission ceiling (SP3): effective = principal ∩ ceiling
};

type DenyReason =
  | "UNKNOWN_PERMISSION" | "SCOPE_MISMATCH" | "NODE_NOT_FOUND" | "ORGANIZATION_SUSPENDED"
  | "PRINCIPAL_INACTIVE" | "NOT_A_MEMBER" | "PERMISSION_NOT_GRANTED" | "OUTSIDE_KEY_SCOPE"
  | "KEY_EXPIRED" | "MFA_REQUIRED" | "IMPERSONATION_READ_ONLY" | "IMPERSONATION_EXPIRED" | "CEILING_EXCLUDES";

type AuthorizeDecision =
  | { allowed: true; requiresApproval: boolean; grantedVia: readonly GrantSource[] }
  | { allowed: false; reason: DenyReason };

export type Authorize = (request: AuthorizeRequest) => Promise<AuthorizeDecision>;
```

Algorithm (each step denies on failure; any unexpected error propagates to the boundary as 500 — never allow):

1. Permission registered and its `scope` matches the node (`platform` ↔ `{ level: "platform" }`).
2. Node chain loaded from the source (`units.ancestorIds` → project → organization), tenant ids consistent, nothing
   soft-deleted, organization `active`.
3. Principal status from the source: user not disabled; impersonation session active and permission `kind: "read"`;
   device doc active in the same tenant; API key active, not expired, node inside the key's node, permission in
   `scopes`, then the **owner user** is evaluated in its place (effective = scopes ∩ owner's current grants).
   Platform permissions: active staff doc, role grants it, `principal.mfa`.
4. Grants = memberships of the principal in the tenant on the node chain (organization, project, ancestors, unit).
   Roles → permissions (system roles from the registry; custom roles from `roles`, deleted ones ignored, unknown
   permission ids ignored).
5. `ceiling` intersection when present.
6. Allowed iff the permission is in the effective set; `requiresApproval` copied from the definition.

`authorize()` reads the source (`memberships`, `roles`, `devices`, `api-keys`, `platform-staff`), never claims or
the projection. Reads are memoized per request (`createRequestScope()`), never across requests.
Companion read model: `getEffectivePermissions({ principal, node, ceiling? })` returns the set (for UI and SP3).

### 5.3 Grant rules (no escalation)

- Granting, inviting or creating an API key at node N with roles/scopes P requires the actor to hold the relevant
  `core.*` permission at N **and** `P ⊆ effective(actor, N)`. Owners satisfy it by construction.
- Removing the last `owner` grant of an organization → `422 LAST_OWNER`.
- Removing a member revokes their grants in the tenant and **revokes every API key they own there**; deleting a
  custom role in use → `409 ROLE_IN_USE`.

### 5.4 Projections

- **Access projection** `access/{tenantId}_{principalId}` is rebuilt from the principal's grants **inside the same
  transaction** as every membership change (pure builder `buildAccessProjection(grants)`): `orgWide` (any org-level
  grant), `projectIds` (project-level grants), `unitIds` (unit-level grants), `visibleProjectIds` (projects with any
  grant inside), `isRevoked` (no grants left, or organization deleted), `version`.
- **Claims** (`tenantId` = active organization, `platformRole`, `accessVersion`) are a projection written by
  `ClaimsProjector.sync(uid)`: read the source (users doc, access doc of the active org, staff doc), then
  `setCustomUserClaims` with the merged object (it overwrites, never merges; payload ≪ 1000 bytes). Membership
  changes bump `users.accessVersion` in the transaction and call `sync` after commit; a failed sync is logged and
  healed by `POST /v1/me/claims/sync` (the client calls it when `GET /v1/me` reports a newer `accessVersion`
  than its token).
- **Active organization**: `PUT /v1/me/active-organization { organizationId }` → `204` (member check via
  authorize `core.organization.read`, rate limited per uid, updates `users.lastContext`, syncs claims); the client
  then forces `getIdToken(true)`. The API itself never relies on the claim: every tenant route names its
  organization (path or resource) and `authorize()` checks it.

### 5.5 Security Rules (defense in depth)

Clients never write (umbrella D8): every `match` has `allow write: if false`. Reads allowed:

| Path | Read rule |
|---|---|
| `users/{uid}` | `request.auth.uid == uid` |
| `access/{accessId}` | `accessId == request.auth.token.tenantId + "_" + request.auth.uid` |
| `organizations/{orgId}` | `orgId == token.tenantId && isMember(orgId)` |
| `projects/{id}` | `resource.data.tenantId == token.tenantId && canSeeProject(resource.data)` |
| `units/{id}` | `resource.data.tenantId == token.tenantId && canSeeUnit(resource.data)` |
| everything else | denied |

Helpers (`firestore.rules`, reused by SP3–SP5): `isMember(t)` = access doc exists and `!isRevoked`;
`canSeeProject()` = `orgWide || resource.id in visibleProjectIds`; `canSeeUnit()` = `orgWide ||
resource.data.projectId in projectIds || (resource.data.ancestorIds.concat([resource.id])).hasAny(unitIds)`;
`resource.data.deletedAt == null` on every entity. One `get()` per
evaluation (the access doc), well under the 10-call limit. Rules are not filters: client queries must filter by
`tenantId == activeTenant` (SP2 knows this; SP2 itself reads through `/v1`).

## 6. Flows

### 6.1 Organizations, projects, units

- `POST /v1/organizations` creates the organization, an `owner` membership for the creator, the projection and an
  audit entry in one transaction, then syncs claims. Allowed for any authenticated user when
  `ORGANIZATION_SELF_SERVE=true` (default), otherwise only for staff with `platform.organization.read` (SP5 adds
  a dedicated platform permission if needed).
- Units: create under the project or a unit (type must allow the parent), depth ≤ 6; `PATCH` may move a unit inside
  its project (cycle check; subtree ≤ 500 units rewritten in batches, else `422 SUBTREE_TOO_LARGE`) and rebuilds the
  projections of principals with grants in the subtree.
- Deleting an organization soft-deletes it and marks every access projection of the tenant `isRevoked`.

### 6.2 Invitations

`POST /v1/organizations/{organizationId}/invitations { email, node, roles }` → `201` with the invitation and a
one-time `acceptUrl` (`${NEXT_PUBLIC_APP_URL}/invite#token=<token>`; the fragment never reaches server logs).
Token: 32 random bytes, stored as `sha256`. `InvitationNotifier` port (no-op adapter in the core; logs
`invitation_created` without email or token). `POST /v1/invitations/preview { token }` (Bearer) → organization name,
inviter display name, masked email, expiry. `POST /v1/invitations/accept { token }` (Bearer): verified email must
equal the invited email (NFC, lower-case) → grant created → `200 { data: { organizationId } }`; expired → `410
INVITATION_EXPIRED`; used → `409 INVITATION_ALREADY_USED`; mismatch → `403 EMAIL_MISMATCH`.

### 6.3 API keys

Format `<prefix>_<publicId>_<secret>`: `API_KEY_PREFIX` (default `core`, `^[a-z]{2,12}$`), `publicId` 12 chars
base32, `secret` 32 random bytes base64url. Stored: `publicId`, `sha256(secret)`; comparison with
`crypto.timingSafeEqual`. `expiresAt` required (≤ 365 days). Failed authentications are rate limited per IP
(`429` **before** hashing once over the limit). `lastUsedAt` updated at most once per minute. The secret is
returned only in the `201` of creation. Decision 0008.

### 6.4 Devices

`POST /v1/organizations/{organizationId}/device-activations { label, node, roles }` → `201 { code, expiresAt }`:
code = 8 Crockford base32 chars (40 bits), single use, TTL 10 min, stored as `sha256`. `POST
/v1/device-activations/redeem { code }` (no auth): per-IP limit (5 failures / 15 min → `429`); success creates the
`devices` doc, a membership (`principalType: device`), the projection, and returns `createCustomToken(deviceId,
{ principalType: "device", tenantId })`. Revocation (`DELETE /v1/devices/{deviceId}`): status revoked, grants
removed, `revokeRefreshTokens(deviceId)`, Auth user disabled.

### 6.5 Approvals (four-eyes)

`approval-requests` hold actions whose permission has `requiresApproval`. `ApprovalActionHandler` registry
(`{ kind, inputSchema, execute(input, context) }`) is filled by SP3/SP5; SP1 ships the flow and a test handler.
Decide: approver ≠ requester (and ≠ the impersonating staff), approver authorized for `core.approval.decide` **and**
for the action's permission at the node → `403 SELF_APPROVAL_FORBIDDEN` / `403 FORBIDDEN` otherwise. Execution is
at-most-once (`approved → executed|failed` in a transaction), with an audit entry per transition. Agent-originated
mutations additionally need user confirmation (umbrella §16.4) — that is SP3/SP4.

### 6.6 Impersonation (staff, read-only)

`POST /v1/platform/impersonation-sessions { targetUid, organizationId, reason }` (permission
`platform.user.impersonate`, MFA) → `201 { sessionId, customToken, expiresAt }` with
`createCustomToken(targetUid, { imp: sessionId, impBy: staffUid })`; expiry ≤ 60 min enforced by `authorize()`
(session doc), not only by token lifetime. `POST /v1/platform/impersonation-sessions/{id}/end` → `204`. Every start,
end and impersonated request is audited in `platform-audit-logs` and in the tenant's `audit-logs`
(`actor.onBehalfOf = staffUid`). The `/admin` UI that uses it is SP5.

### 6.7 Audit

`AuditWriter.record(entry, tx?)` writes inside the business transaction when one exists. Audited actions (minimum):
`ORGANIZATION_CREATED|UPDATED|DELETED`, `PROJECT_*`, `UNIT_*`, `ROLE_*`, `MEMBERSHIP_GRANTED|UPDATED|REVOKED`,
`INVITATION_CREATED|ACCEPTED|REVOKED`, `API_KEY_CREATED|REVOKED`, `DEVICE_ACTIVATED|REVOKED`,
`ACTIVE_ORGANIZATION_CHANGED`, `SESSION_REVOKED`, `ALL_SESSIONS_REVOKED`, `IMPERSONATION_STARTED|ENDED`,
`APPROVAL_REQUESTED|APPROVED|REJECTED|EXECUTED`, `PLATFORM_STAFF_GRANTED`, and denied platform/impersonation
attempts. Entries never contain secrets, tokens, emails or free text beyond the reason field; `changes` lists field
names. No TTL until `compliance.md` is filled (umbrella §16.2).

## 7. HTTP API

### 7.1 Endpoint descriptors (spec-first)

`@core/contracts` gains `defineEndpoint()` (`src/contracts/http/endpoint.ts`):

```ts
defineEndpoint({
  id: "identity.getMe", method: "GET", path: "/v1/me",
  auth: "user" | "principal" | "none",   // "principal" also admits device and service
  params?: ZodObject, query?: ZodObject, body?: ZodType,
  responses: { 200: MeResponseSchema } | { 204: null },
  errors: ["UNAUTHORIZED", ...], idempotency?: "optional" | "required", rateLimit?: RateLimitPolicyId,
  summary: string,
});
```

`CORE_ENDPOINTS` is rendered into `docs/openapi/v1.yaml` `paths` by `contracts:catalog` (checked by
`contracts:check`). Server handlers (`withApiRoute`) and SP2's typed client both consume the descriptors.

### 7.2 Pipeline (`services/shared/http/api-route.ts`)

`withApiRoute(endpoint, deps, handler)` = `withRouteBoundary` + rate limit (when declared) → authenticate (§3.2)
→ validate params/query/body with `safeParse` (all issues at once, `400 VALIDATION_FAILED`) → idempotency
(`Idempotency-Key` ULID; same key + different body → `409 IDEMPOTENCY_KEY_REUSED`; replay returns the stored
status/body) → `handler({ principal, input, requestId, authorize, audit })`. The handler calls `authorize()` for its
node **before** any side effect, maps domain `Result` errors to status codes, and returns the `{ data, meta? }`
envelope. Errors use `errorResponse` (`contracts/api.md` §6). A resource the caller cannot see answers `404` (not
403) when revealing existence would leak tenant data.

### 7.3 Endpoints

All paths are `/v1/...`; list endpoints use cursor pagination (`limit` default 20, max 100, `meta.page`).

| Method + path | Permission (node) | Success | Notable errors |
|---|---|---|---|
| `GET /me` | user | 200 `Me` (profile, preferences, `isPlatformStaff`, `platformRole`, `mfaEnrolled`, `accessVersion`) | 401 |
| `PATCH /me` | user | 200 `Me` | 400 |
| `PUT /me/active-organization` | `core.organization.read` (org) | 204 | 403, 429 |
| `POST /me/claims/sync` | user | 204 | 429 |
| `GET /me/organizations` | user (projection) | 200 list | — |
| `GET /me/context?organizationId&projectId&unitId` | `core.organization.read` (node) | 200 `AccessContext` (§10) | 404 |
| `GET /me/sessions` | user | 200 list | — |
| `DELETE /me/sessions/{sessionId}` | own session | 204 | 404 |
| `POST /me/sessions/revoke-all` | user (checkRevoked) | 204 | — |
| `POST /me/desktop-sessions` | user | 201 `{ sessionId, secret, expiresAt }` | — |
| `POST /desktop-sessions/exchange` | none (rate limited) | 200 `{ customToken, secret, expiresAt }` | 401, 429 |
| `POST /organizations` | self-serve flag | 201 + `Location` | 403 |
| `GET\|PATCH\|DELETE /organizations/{organizationId}` | `core.organization.read\|update\|delete` | 200/200/204 | 404, 422 |
| `GET\|POST /organizations/{organizationId}/projects` | `core.project.read` (visible only) / `.create` (org) | 200/201 | 403 |
| `GET\|PATCH\|DELETE /projects/{projectId}` | `core.project.*` (project) | 200/200/204 | 404 |
| `GET\|POST /projects/{projectId}/units?parentUnitId=` | `core.unit.read` / `.create` (parent) | 200/201 | 422 `INVALID_UNIT_PARENT` |
| `GET\|PATCH\|DELETE /units/{unitId}` | `core.unit.*` (unit) | 200/200/204 | 422 `SUBTREE_TOO_LARGE` |
| `GET /unit-types` | user | 200 list | — |
| `GET /permissions` | user | 200 list (tenant scope) | — |
| `GET\|POST /organizations/{organizationId}/roles` | `core.role.read\|create` | 200/201 | 422 `UNKNOWN_PERMISSION` |
| `GET\|PATCH\|DELETE /roles/{roleId}` | `core.role.*` | 200/200/204 | 409 `ROLE_IN_USE` |
| `GET /organizations/{organizationId}/members` | `core.member.read` | 200 list | — |
| `DELETE /organizations/{organizationId}/members/{userId}` | `core.member.remove` | 204 | 422 `LAST_OWNER` |
| `GET\|POST /organizations/{organizationId}/memberships` | `core.member.read\|update` (node) | 200/201 | 409, 403 `ESCALATION_FORBIDDEN` |
| `PATCH\|DELETE /memberships/{membershipId}` | `core.member.update\|remove` | 200/204 | 422 `LAST_OWNER` |
| `GET\|POST /organizations/{organizationId}/invitations` | `core.member.read\|invite` | 200/201 | 403 |
| `DELETE /invitations/{invitationId}` | `core.member.invite` | 204 | 404 |
| `POST /invitations/preview` / `POST /invitations/accept` | user | 200 | 403, 409, 410 |
| `GET\|POST /organizations/{organizationId}/api-keys` | `core.api-key.read\|create` | 200/201 (secret once) | 403 |
| `DELETE /api-keys/{apiKeyId}` | `core.api-key.revoke` | 204 | 404 |
| `GET /organizations/{organizationId}/devices`; `DELETE /devices/{deviceId}` | `core.device.read\|revoke` | 200/204 | 404 |
| `POST /organizations/{organizationId}/device-activations` | `core.device.create` | 201 | 403 |
| `POST /device-activations/redeem` | none (rate limited) | 200 | 401, 429 |
| `GET /organizations/{organizationId}/audit-logs?action&actorId&occurredAfter&occurredBefore` | `core.audit-log.read` | 200 list | — |
| `GET\|POST /organizations/{organizationId}/approval-requests?status=` | `core.approval.read` / action permission | 200/201 | 422 |
| `POST /approval-requests/{id}/approve` / `.../reject` | `core.approval.decide` + action permission | 200 | 403 `SELF_APPROVAL_FORBIDDEN`, 409 |
| `POST /platform/impersonation-sessions`; `POST .../{id}/end` | `platform.user.impersonate` (MFA) | 201/204 | 403 `MFA_REQUIRED` |

Rate limits (decision 0009, Firestore buckets): device redeem 5 failures / 15 min per IP; API key failures 20 /
min per IP; desktop exchange 10 / min per IP; active organization switch 10 / min per uid; invitation accept and
preview 20 / min per uid; `429` carries `Retry-After`, `X-RateLimit-Limit|Remaining|Reset`.

## 8. Environment and configuration

New variables (validated in the services env, `.env.example` updated): `SESSION_MAX_AGE_DAYS` (default 5),
`DESKTOP_SESSION_MAX_AGE_DAYS` (default 30), `API_KEY_PREFIX` (default `core`), `ORGANIZATION_SELF_SERVE`
(default `true`), `MFA_FACTORS` (default `totp`; `.env.example` sets `phone` for local),
`NEXT_PUBLIC_APP_URL` (exists). `FIREBASE_*_EMULATOR_HOST` stays rejected outside `local` by `ServicesEnvSchema`;
SP1 adds a guard in the Firebase Admin factory that inspects `process.env` directly (firebase-admin reads it
itself) and refuses to initialize when an emulator host is set and `APP_ENV !== "local"` (follow-up #12c).

## 9. Testing (SP1 gate, umbrella §13)

- **Unit (pure, fakes):** `authorize()` matrix — inheritance org→project→unit→sub-unit, sibling isolation,
  multi-organization isolation, custom roles, deleted role/grant/node, suspended org, unknown permission,
  scope mismatch, device principal, API key (scopes ∩ owner, owner removed, expired, out of node), staff with and
  without MFA, impersonation read-only and expired, agent ceiling; `buildAccessProjection`; escalation guard;
  regional settings resolution; token verification `checkRevoked` split (#12e).
- **Emulator:** Firestore adapters (transactions, uniqueness, projection consistency), rate limiter, idempotency,
  claims projector against the Auth Emulator, session cookie/exchange, device redeem → custom token → ID token
  accepted by the pipeline, route-level tests of the `/v1` handlers.
- **Rules (`@firebase/rules-unit-testing`):** every collection denies writes; reads per §5.5, including cross-tenant,
  revoked member, non-active tenant claim, device principal, unit visibility by ancestor.
- Gate commands: `pnpm test`, `pnpm test:emulators`, `pnpm contracts:check`, `pnpm lint`, `pnpm typecheck`.

## 10. Hooks for SP2–SP5

| Consumer | What SP1 provides |
|---|---|
| SP2 (UI) | endpoint descriptors (`CORE_ENDPOINTS`) for a typed client; `GET /me`, `/me/context`, `/me/organizations`; Server Action adapters `createSession/exchangeSession/signOut` and RSC guards `requireWebSession()` / `requirePlatformStaffSession()`; `MFA_FACTORS`; unit-type and permission listings; module contributions accepted by `createAccessServices({ permissions })` and `createTenancyServices({ unitTypes })` |
| SP3 (agents) | `authorize()` with `ceiling`; `getEffectivePermissions()`; `resolveAccessContext({ principal, node })` → `{ tenantId, projectId?, unitId?, principal, permissions, regional: { locale, displayTimeZone, nodeTimeZone, currency } }` — the inputs of Mastra's `RequestContext`; `verifyBearer()` for the own `MastraAuthProvider` (follow-up #12a–d stay SP3); `AuditWriter`; approval requests + `ApprovalActionHandler` registry; resource id `tenantId:uid` |
| SP4 (chat) | approval requests for tool approval, audit writer, Rules helpers for realtime conversation metadata |
| SP5 (admin, workflows) | staff model, impersonation backend, platform audit logs, approval inbox data, `nodeTimeZone` for schedules |

## 11. Decisions recorded by SP1 (`app/docs/decisions/`)

| # | Title |
|---|---|
| 0006 | Tenancy and access model (set-based tenancy, node inheritance, projections, claims, Rules) — stands in for `rules/tenancy.md` |
| 0007 | Authentication sessions (web cookie + in-memory Firebase + custom-token exchange; desktop session secret; MFA carry-over; SMS locally, TOTP remote) |
| 0008 | API keys and device activation (formats, hashing, entropy, lockouts, owner-bound permissions) |
| 0009 | Rate limiting and idempotency on Firestore (buckets, TTL, key derivation) |
| 0010 | Dependency audit advisories (follow-up #10) |

## 12. Risks and defaults chosen without asking

| Risk / open question | Default |
|---|---|
| TOTP is not emulated | SMS MFA locally; TOTP covered by unit tests with a fake auth port; real TOTP verified in the first remote environment (deploy checklist) |
| Custom-token sign-in drops the MFA claim | developer claim `smfa` set only from a verified session record; staff check accepts it only with `sign_in_provider == "custom"` |
| Firebase has no per-session revocation | own `sessions` records checked on every exchange/guard; global revoke via `revokeRefreshTokens` |
| Firestore counters for rate limits (≈1 write/s/doc) | used only on low-volume endpoints; hot paths (LLM) get their own limiter in SP3 |
| Email delivery for invitations | no provider in the core: link returned once to the inviter; `InvitationNotifier` port for later |
| Self-serve organizations | on by default (`ORGANIZATION_SELF_SERVE`) |
| Staff reading tenant data | only through read-only, time-boxed, audited impersonation |
