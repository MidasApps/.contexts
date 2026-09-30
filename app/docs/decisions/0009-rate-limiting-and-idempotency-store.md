# 0009. Rate limiting and idempotency on Firestore

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/services/src/services/shared/{rate-limit,idempotency}`, `app/firestore.indexes.json`
  (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Refines:** SP1 spec §7.2, §7.3 (rate limits); `contracts/api.md` §7 (rate limit headers), §11 (idempotency)

## Context

`rules/security.md` §8 asks for rate limits on auth and abuse-prone endpoints, and `rules/api-design.md` requires
`Idempotency-Key` with results kept ≥ 24 h. The web runs on App Hosting (several instances, scale to zero), so
per-instance memory is not shared. SP1 already depends on Firestore; Postgres arrives for Mastra storage in SP3 and
is not reachable from every runtime.

## Decision

1. **Rate limit buckets** in `rate-limit-buckets/{id}` where `id = sha256(policyId + ":" + subject)` (subject = IP
   or uid; never stored in clear). Fixed window: a transaction reads `{ count, windowStart }`, resets when the
   window elapsed, increments, and writes `expiresAt = windowStart + window`. A Firestore TTL policy on `expiresAt`
   deletes old buckets. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and, on
   `429 RATE_LIMITED`, `Retry-After`.
2. **Named policies** (limit / window): `device-redeem` 5 failures / 15 min per IP; `api-key-failure` 20 / min per
   IP; `desktop-exchange` 10 / min per IP; `active-organization-switch` 10 / min per uid; `invitation-accept` and
   `invitation-preview` 20 / min per uid. Endpoint descriptors reference a policy by id.
3. **Idempotency records** in `idempotency-records/{id}` where `id = sha256(principal + ":" + endpointId + ":" +
   idempotencyKey)`. `begin(scopeKey, requestHash)` runs in a transaction: missing → create `in-flight`; same hash
   and `done` → replay the stored `{ status, body }`; same hash and `in-flight` → `409` (retry later); different
   hash → `409 IDEMPOTENCY_KEY_REUSED`. `complete` stores the response and `state: done`. `expiresAt = now + 24 h`
   with a TTL policy. `requestHash = sha256(canonical JSON of params, query and body)`.
4. Ports (`RateLimiter`, `IdempotencyStore`) have in-memory adapters for unit tests; the Firestore adapters run in
   emulator tests with an injected clock.

## Consequences

- One document holds a counter, so a bucket takes about one sustained write per second. The limited endpoints are
  low volume (sign-in adjacent flows); hot paths such as LLM calls get their own limiter in SP3.
- TTL deletion is eventual (usually within a day); correctness never depends on it because `windowStart` and
  `expiresAt` are checked in code.
- No PII: bucket and record ids are hashes, and records keep response bodies only for 24 h.

## Alternatives rejected

- **In-memory limiter.** Not shared across App Hosting instances and lost on scale-to-zero.
- **Postgres.** Not provisioned for every runtime in SP1; adds a connection pool to the web for two small tables.
- **Redis / Memorystore.** New infrastructure and cost for low-volume limits; revisit if SP3 needs high-rate limits.
- **Sliding log.** Exact, but one document per request multiplies writes.

## Amendments

- **2026-09-29 (SP1 review of Tasks 1–3).** The two `409` answers of Decision 3 get distinct codes: a different
  request hash is `409 IDEMPOTENCY_KEY_REUSED` (client bug, never retry with that key); a record still `in-flight`
  is `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` with `Retry-After: 1` (retry the same request later). Both are in
  `CORE_ERROR_CODES` (`packages/contracts/src/contracts/http/error-codes.ts`).
