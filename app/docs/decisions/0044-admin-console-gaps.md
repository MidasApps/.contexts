# 0044. Admin console gaps: the endpoints the `/admin` pages lacked

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/contracts/src/contracts/platform/admin-user*.ts`, `app/packages/services/src/services/platform` (admin user directory, handler), `app/packages/services/src/services/shared/{text,firestore}` (search text, `users.searchName`, backfill), the three writers of `users/{uid}`, `app/scripts/backfill-user-search-names.ts`, `app/apps/web/src/app/v1/admin/users`, `app/packages/client/src/{entities/admin-user,views/admin-users}` (local decision; the framework is unchanged)
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
