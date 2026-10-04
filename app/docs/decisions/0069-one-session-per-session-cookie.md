# 0069. One session record per session cookie

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `packages/services` identity (web sessions); refines decision 0007, the framework is unchanged

## Context

Decision 0007 keeps a `sessions` record holding only `sha256(cookie)`. Every request then finds the record by that hash and checks that it is still open.

Firebase ID tokens carry no nonce. Two sign-ins of the same user in the same second, from two browsers, therefore get byte-identical ID tokens. `createSessionCookie` then returns byte-identical cookies too. The Auth Emulator confirmed this on 2026-10-04: same second, same cookie; the next second, a different cookie. Production tokens are signed with RS256, whose signature is deterministic, so the same happens there.

Before this decision, each sign-in created its own record. That left two records with one hash. Revoking either record changed nothing, because `findByCookieHash` still returned the other, open record. The e2e test "revokes another session, which then has to sign in again" failed whenever the suite ran fast enough for both sign-ins to land in one second.

## Decision

- `createWebSession` looks up the new cookie's hash before it creates a record. If an open web record already holds that hash, it returns that record and creates nothing.
- One credential is one session. Revoking it, or signing out of it, ends every browser that holds that cookie.

## Alternatives rejected

- **Close the cookie when any record with its hash is revoked.** Revoking the "other" session would also sign out the browser that revoked it, and the twin records would still be listed.
- **Make each cookie unique.** The cookie is Firebase's; we cannot add a nonce to it.

## Consequences

- The e2e test signs the second browser in during a later second, so it gets a separate session to revoke.
- Desktop sessions are unaffected: their secret is random (`randomBytes`), not derived from the ID token.
