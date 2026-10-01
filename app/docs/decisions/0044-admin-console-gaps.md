# 0044. Admin console gaps: the endpoints the `/admin` pages lacked

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/contracts/src/contracts/platform/{admin-user*,organization-admin.schema,admin-endpoints}.ts`, the organization list and detail use cases and store (`countMembers`), `app/packages/client/src/{entities/admin-organization,views/admin-organizations,views/admin-organization-detail}`, `app/packages/services/src/services/platform` (admin user directory, handler), `app/packages/services/src/services/shared/{text,firestore}` (search text, `users.searchName`, backfill), the three writers of `users/{uid}`, `app/scripts/backfill-user-search-names.ts`, `app/apps/web/src/app/v1/admin/users`, `app/packages/client/src/{entities/admin-user,views/admin-users}` (local decision; the framework is unchanged)
- **Records:** SP5 plan Task 13b (the API gaps listed in `docs/plans/2026-09-29-sp5-workflows-admin/reports/task-12-13.md`)
- **Relates to:** decisions 0006 (tenancy and access), 0041 (admin composition), 0042 (admin UI), 0043 (staff operations endpoints)

One section per gap. Each later gap of Task 13b appends its own section here.

## 1. Staff user search (`GET /v1/admin/users?query=`)

### Context

`/admin/users` asked staff to type a user id, because no endpoint found a user. Firestore has no
substring or case-insensitive search: a query can only match a whole value or a prefix range of
one field. `users/{uid}` stores `email` and `displayName` as written; Firebase Auth lowercases
emails, and a display name keeps its case and accents.

### Decision

1. **One endpoint, three readings of the text.** `GET /v1/admin/users` (`admin.listUsers`,
   `requireStaff` with `platform.user.read`, cursor paged with `meta.page`) takes `query` (1 to 200
   characters) and an optional `by`:
   - `email`: prefix range on `users.email` with the text lowercased;
   - `name`: prefix range on `users.searchName` with the text normalized;
   - `uid`: the document with that exact id (zero or one row).
   Without `by`: text with `@` is an email; else the user whose id is the text, when one exists
   (first page only); else a name.
2. **`users.searchName`, a storage-only field.** It holds the display name without accents, in
   lowercase and with inner spaces collapsed (`normalizeSearchText`). The same function normalizes
   the query, so both sides agree. The field is not in the `identity.User` contract (reads drop
   it; the contract converter tolerates extra stored fields). The three writers of a display name
   store it through `userSearchFields`: identity's `ensure` and `updateProfile`, and access's
   `create` (the founder's doc in `createOrganization`).
3. **Each search is one range on one field**, ordered by that field and the document id, which
   the automatic single-field indexes serve (no composite index). The cursor is `[value, id]`.
4. **Migration: expand, then backfill.** New and changed profiles get the field at once.
   `pnpm users:backfill-search-names -- --project <id> --confirm <id> [--dry-run]
   [--start-after <uid>] [--batch-size <n>]` fills the others: it walks `users` by id in batches,
   writes only docs whose field is missing or stale (a second run updates nothing), prints a
   checkpoint per batch and resumes with `--start-after`. It prints ids and counts, never a name
   or an email. There is no contract phase: nothing is removed.
   **Rollback:** the field is additive. Reverting the code leaves a field nobody reads; it can
   stay, or a one-off script can delete it. No other reader depends on it.
5. **The text is personal data.** The handler never logs it and never echoes it in `details`; the
   request log has no URL. The client keeps it in component state, not in the page URL, and
   searches on submit, not per keystroke.
6. **No criteria is an error.** Without `query` and without `ids` the endpoint answers
   400 `VALIDATION_FAILED` (`query: REQUIRED`): the console never lists every user.
7. **The view row is lenient.** A users doc another writer left partial (no email yet) is still
   found by id, with `email: null`; a doc that cannot fit the view is skipped, never a 500.

### Consequences

- Staff find a user by the start of the name or of the email, or by the whole id, and pick the
  user for support access instead of typing an id.
- **Prefix only.** "souza" does not find "Ana Souza", and a text in the middle of an email finds
  nothing. The page says so in its hint and in the no-match state.
- A user whose doc predates the field is not found by name until the backfill runs in that
  environment (email and id searches work at once). The backfill must run once per environment
  after this deploy.
- A user who never signed in has no `users` doc and is not found (Firebase Auth has no search).
- The search text travels in the query string of a `GET`. The core's request log does not record
  URLs; a proxy or load balancer in front of the web app that logs full URLs would record it.
  Follow-up if such a log exists: move the search to `POST /v1/admin/users/search`.

### Alternatives rejected

- **Scan every user and filter in memory.** Each search would read the whole collection.
- **Case-sensitive prefix on `displayName`.** "ana" would not find "Ana"; staff would have to
  guess the stored spelling.
- **A search service (Algolia, Typesense) or a tokens array for word matches.** New
  infrastructure or a larger stored field for a staff-only page; a follow-up when prefix search
  proves too narrow.
- **Firebase Auth `getUserByEmail`.** Exact email only, and it would answer accounts that have no
  profile in the app.

## 2. One organization and server-side organization search

### Context

`/admin/organizations/:id` found its organization in the list (no read by id, no member count),
and the list page read up to 2 000 organizations and filtered them in the browser. Firestore has no
substring search. Memberships are grants: one person may hold several (organization, project,
unit), and a person invited to one project has no grant at the organization node.

### Decision

1. **`GET /v1/admin/organizations/{organizationId}`** (`admin.getOrganization`, `requireStaff`
   with `platform.organization.read` and `targetTenantId`): the list row plus `memberCount`
   (`platform.OrganizationAdminDetail`); 404 when the organization does not exist or is deleted.
2. **Member count = distinct users holding a live grant at any node of the organization**, the
   same people the organization's members list shows. Devices are not counted. Firestore `count()`
   cannot count distinct values, so the store reads the live user grants of the tenant with a
   field mask (`principalId` only) and deduplicates them, up to 10 000 grants
   (`MEMBER_COUNT_GRANT_LIMIT`). The query has equality filters only (`tenantId`, `principalType`,
   `deletedAt`), served by the automatic single-field indexes: no new composite index.
3. **`GET /v1/admin/organizations` takes `query` and `status`.** The server reads live
   organizations in id order (batches of 200) and keeps those whose name or id contains every word
   of the text, case and accents ignored (`normalizeSearchText`), and whose status matches. Plan,
   budget and cost are computed for the rows of the page only.
   - It looks for one match more than the page holds, so `hasMore` is exact.
   - One call reads at most 2 000 organizations (`ORGANIZATION_SCAN_BUDGET`). When the budget ends
     first, the page is short (maybe empty) with `hasMore: true`, and its cursor continues the scan.
   - The cursor is the id of the last row returned (or of the last organization read).
   - **An exact organization id always hits:** on the first page the organization with that id is
     read directly and comes first; the scan skips it, so it never appears twice.
   - Without `query` and `status` the list is unchanged.
4. **Client.** The detail page reads the new endpoint. The list page keeps `q` and `status` in the
   URL (an organization name is not personal data), waits 300 ms after typing before it asks, and
   pages by cursor (previous and next; loaded pages stay cached). Organization writes update the
   cached detail from the response and invalidate the searched lists.

### Consequences

- Staff find an organization by any word of its name, not only by its start, with no stored
  search field, no backfill and no change to the tenancy writers.
- A search costs one document read per live organization until the page fills. That is fine for
  thousands of organizations; beyond tens of thousands a search for a rare word takes several
  "next" clicks through short pages. Follow-up at that size: a stored normalized name with a
  prefix range, as `users.searchName`.
- The page number left the URL (cursors are opaque), and the list no longer shows a total count.
- An organization with more than 10 000 live user grants shows a member count that stops growing.
- `AdminOrganizationFilter` (the picker of traces, flags, workflows, connectors and support
  access) and the costs page still read the whole list, bounded at 2 000 organizations.

### Alternatives rejected

- **A stored `searchName` with a prefix range, as for users.** Prefix only ("sul" would not find
  "Grupo Sul"), plus a backfill and a change to every writer of `organizations`; organizations are
  few enough to scan.
- **`count()` of the grants at the organization node.** It would miss people who only hold a
  project or unit grant and count nobody twice only by accident.
- **A member counter on the organization document.** Every grant and revoke would have to
  maintain it transactionally; a follow-up if the count read becomes costly.

## 8. Names for user ids in admin lists (`GET /v1/admin/users?ids=`)

### Context

Prompt versions, prompt activations and workflow runs carry the id of the user who wrote,
activated or started them, and the admin lists showed that id. Resolving one name per row would be
one request per row.

### Decision

1. **The same endpoint takes `ids`**: a comma-separated list of at most 100 ids (400
   `ids: TOO_MANY` above it, `ids: NOT_WITH_QUERY` together with `query`). The handler reads them
   with one Firestore `getAll` and answers the same `platform.AdminUserSummary` rows in the order
   asked, without the unknown ids and without repeats, as one page (`hasMore: false`).
2. **The client asks once per list.** `useAdminUserNames(ids)` (entity `admin-user`) dedupes and
   sorts the ids on screen, makes one call (one per 100 ids), caches it for five minutes and
   returns a resolver: display name, else email, else the id.
3. **Names never block or break a list.** While loading, without `platform.user.read`, or on any
   failure, the resolver answers the id, as before. The lookup is not retried.
4. **Wired where the admin showed a raw user id:** the author of a prompt version, who activated
   a prompt, and who started a workflow run (the table and the run's timeline, which takes the
   name as a prop so the widget stays usable outside `/admin`).

### Consequences

- The lists show names; the id stays as the tooltip of the name.
- Schedules do not show their creator, so nothing changed there.
- A list of more than 100 distinct users on one page makes two calls; admin pages hold 20 to 100
  rows.

### Alternatives rejected

- **Add name fields to each list contract.** Every list endpoint (and the runtime's console
  routes, which have no access to `users`) would have to join users; one lookup serves all lists.
- **A separate `/v1/admin/user-names` endpoint.** Same permission, same rows; a second endpoint
  would only duplicate the contract.

## 3. Catalog of the registered agents (`GET /v1/admin/agents`)

### Context

`/admin/agents` listed five core agent ids hard-coded in the client. The agents live in the Mastra
runtime, which the web app reaches only through the `/console/*` routes (decisions 0040, 0043). An
agent's tools and skills are functions resolved per run (the organization's connectors, web
opt-ins and enabled modules), so they cannot be read from a built agent without a tenant.

### Decision

1. **The runtime reports its own registry.** `GET /console/agents` answers `buildAgentCatalog`:
   the supervisor first (with the ids of the subagents it may delegate to), then every agent
   definition, core and module, in registration order. Names and descriptions come from the built
   agents; the permission ceiling from the definition.
2. **Tools and skills are declared.** `AgentDefinition.catalog` (optional, data only) names the
   tools an agent has in every organization and the core skills it loads, and
   `perOrganizationTools` says that connectors or opt-ins add more per run. The five core
   definitions declare it from the same constants their `create` uses. An agent that declares
   nothing is listed without tools and skills.
3. **`GET /v1/admin/agents`** (`admin.listAgents`, `requireStaff` with `platform.agent.manage`)
   answers the catalog as `platform.AdminAgent[]`; a malformed or unreachable runtime is 502. It is
   registry data: no prompt, no tenant data, so no organization filter.
4. **Enablement stays in the agent settings.** The contract says whether an agent is `always`
   available or enabled `per-organization`; which organization enabled which subagent is still
   `GET /v1/admin/organizations/{id}/agent-settings`. The page now offers every registered
   subagent to an organization, a module's too, not only the core four plus the enabled ones.

### Consequences

- The page shows what is deployed, module agents included, with role, subagents, tools, skills
  and ceiling. Core agents keep their translated names; a module agent shows the name and
  description its code registered (English).
- The declared tools can drift from what `create` binds when someone edits one without the other.
  Follow-up: derive both from one list in the definition.
- Skills of enabled modules and connector tools are per organization and are not in the catalog.

### Alternatives rejected

- **Read tools from the built agents (`agent.listTools()`).** It needs a request context of a
  tenant, and would answer one organization's tools as if they were the agent's.
- **A static list in `@core/contracts`.** It cannot know the installed modules.

## 4. Usage by day and by model (`GET /v1/admin/usage`)

### Context

`/admin/costs` showed cost month to date per organization only. The ledger (`usage.llm_calls`,
decision 0026) has every call with its day and model, under row level security per tenant: the
runtime role reads one tenant at a time.

### Decision

1. **`GET /v1/admin/usage`** (`admin.getUsage`, `requireStaff` with `platform.usage.read`):
   `from` and `to` are UTC days (`2026-09-30`), `to` included; `organizationId` narrows to one
   live organization (404 otherwise). Defaults: `to` = today (UTC), `from` = the first day of the
   month of `to`. A range is at most 92 days (400 `to: RANGE_TOO_LONG`), `from` not after `to`
   (400 `from: AFTER_TO`).
2. **Straight from the ledger, one grouped read per organization** (`GROUP BY` UTC day, provider,
   model on `llm_calls_tenant_occurred_idx`), as `usage_runtime` under that tenant's row level
   security, eight organizations at a time. The use case sums them into `totals`, `byDay` (every
   day of the range, zeros filled) and `byModel` (highest cost first).
3. **Bounded.** One answer reads at most 2 000 live organizations and says `truncated: true`
   beyond that; the page then asks staff to filter by organization.
4. **Unpriced calls are counted, not priced.** `unpricedCalls` travels with every total; cost sums
   priced calls only, as everywhere in the ledger.

### Consequences

- The costs page charts cost by day and by model and lists the models, for the month to date or
  a chosen range, platform-wide or for one organization.
- Days are UTC (the ledger's days), unlike the other `/admin` dates, which use the browser's zone
  (decision 0042); the section says so.
- A platform-wide read costs one query per organization. Follow-up when that hurts: read
  `usage.daily_rollups` (lags up to an hour) or the warehouse instead.

### Alternatives rejected

- **`usage.daily_rollups`.** Rebuilt hourly for yesterday and today only, and keyed by agent, not
  by provider; the ledger is exact and the range is bounded.
- **A role that bypasses row level security for staff.** One query instead of N, but it weakens
  the isolation every other usage read relies on.

## 5. Impersonation sessions for staff (`/v1/admin/impersonation-sessions`)

### Context

`/admin/users` knew only the session its own browser tab had started. SP1's
`POST /v1/platform/impersonation-sessions/{id}/end` ends the caller's own session and answers 404
for anyone else's.

### Decision

1. **`GET /v1/admin/impersonation-sessions`** (`requireStaff` with `platform.user.read`): every
   staff member's sessions, newest first, cursor paged (`[createdAt, id]`), each with a status
   computed at read time (`active`, `ended`, `expired`). `?status=active` answers only the open
   ones, soonest expiry first, in one page of at most 200 (a session lives at most an hour).
2. **`POST /v1/admin/impersonation-sessions/{sessionId}/end`** (`requireStaff` with
   `platform.user.impersonate`): staff end any open session, a colleague's too. This is a
   deliberate widening of SP1's rule, for the case that needs it: a session left open by someone
   who is away. Idempotent: an ended or expired session answers 204 with no write and no audit
   entry; an unknown id is 404.
3. **Audit.** `IMPERSONATION_ENDED` on the platform log with the staff member who ended it as
   actor, the session as target and `targetTenantId`; and on the tenant log exactly as SP1 writes
   it (the impersonated user on behalf of the session's staff member).
4. **No composite index.** The list is one order on `createdAt`; the open ones are a range on
   `expiresAt`, with the few already ended dropped in memory.
5. **SP1's endpoints are unchanged.** The tab's own session still ends through SP1's route.

### Consequences

- The users page lists the open sessions (or all), with staff and user names from the batched
  lookup, organization, reason and status, and ends one after a confirmation.
- Any staff member with `platform.user.impersonate` can cut a colleague's support access short.
  It is audited, and it cannot start or extend access.

### Alternatives rejected

- **Only list, never end another's session.** The list would show a problem staff cannot act on.
- **A new permission for ending others' sessions.** No role would differ from
  `platform.user.impersonate` today; a follow-up if support and admin roles ever need to.

## 6. Removing an organization's flag override (`DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}`)

### Context

Staff could set an organization's override to on or off, but never take it away: once set, the
organization stopped following the environment value for good.

### Decision

1. **The override is a sub-resource.** `DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}`
   (`flags.adminClearOverride`, `requireStaff` with `platform.flag.manage` and `targetTenantId`
   first). It answers 200 with the flag as that organization now sees it (`tenantOverride: null`),
   404 for a flag that is not in the registry.
2. **Idempotent.** Removing an override that does not exist answers the same 200 and writes no
   audit entry.
3. **Audited as a flag write.** `FEATURE_FLAG_UPDATED` on the platform log with `targetTenantId`
   and `changes: ["tenantOverride"]`. No new audit action and no metadata: audit metadata is an
   allowlist, and the changed field already says what happened.
4. **Dotted keys.** Flag keys contain dots (`chat.voice`). The Firestore adapter deletes the map
   entry with `new FieldPath("values", key)` inside a transaction; a dotted string path would be
   read as nested fields and delete nothing. The emulator test covers a key that is a prefix of
   another (`chat.voice` and `chat.voice.realtime`).

### Consequences

- `/admin/flags` offers "remove override" only on rows that have one, behind a confirmation.
- Tenants still cannot remove their own override through `/v1/flags` (they can set it); that is a
  follow-up for `/settings/flags`.

## 7. Trace time range and ledger cost

### Context

The trace lists had no time filter, and every trace cost was `null`: the runtime's spans carry
tokens, not prices. The ledger stores the cost of each model call with its `trace_id`.

### Decision

1. **Time range.** `GET /v1/traces` and `GET /v1/admin/traces` take `startedAfter` (inclusive) and
   `startedBefore` (exclusive), ISO instants. An inverted or empty range is 400
   `startedBefore: NOT_AFTER_START`. The runtime passes it to Mastra's `startedAt` filter and
   checks each trace again, like the tenant filter.
2. **Cost of a trace = what the ledger recorded for it.** After the runtime answers, the use case
   reads the ledger once per tenant on the page (`trace_id = ANY(...)`, grouped), under that
   tenant's row level security. `costMicroUsd` stays `null` for a platform trace (no tenant), a
   trace without ledger rows, and a trace with an unpriced call (unknown, never a partial sum).
3. **The read keeps to the ledger's time index.** `trace_id` has no index, so the query is bound
   to calls from one hour before the earliest trace start on the page to 48 hours after the
   latest (a run suspended for an approval resumes later under the same trace).
4. **The ledger never fails a trace read.** If it cannot be read, costs stay `null` and
   `trace_costs_unavailable` is logged once, without trace ids.
5. **Spans stay without cost.** The ledger has no span id.

### Consequences

- `/admin/traces` filters by day (browser time zone, decision 0042) and shows costs; the tenant
  endpoints get both too.
- A call recorded more than 48 hours after its trace started is not in the trace's cost.
- Follow-ups: an index on `(tenant_id, trace_id)` if the range read gets slow; span-level cost
  needs the span id in the ledger.

## 9. Confirmation before pausing or resuming a schedule

### Context

Pause and resume ran on one click. Pausing a platform schedule stops a core job (approval expiry,
purge, usage report) for every organization.

### Decision

`ScheduleStateDialog` (feature `admin-schedule-actions`) confirms both actions. For a platform
schedule the pause confirmation is destructive, names the consequence for every organization and
its button reads "pause platform job". A failure stays in the dialog with the request reference
(before, it was a toast). No API change.

## Scope of sections 3 to 9

`app/packages/contracts/src/contracts/platform/{admin-agent*,admin-usage.schema,admin-impersonation*,flag-endpoints}.ts`,
`contracts/observability/endpoints.ts`, `app/packages/agents/src/console/{agent-catalog,console-routes,trace-reader}.ts`
and `runtime/agent-module.ts`, `app/packages/services/src/services/{platform,flags,identity,observability,usage}`,
`app/apps/web/src/app/v1/admin/{agents,usage,impersonation-sessions,flags}`, and the admin entities, features and views
of `app/packages/client` that read them.
