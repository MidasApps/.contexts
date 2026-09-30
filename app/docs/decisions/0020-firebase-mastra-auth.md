# 0020. Own Firebase auth provider for Mastra and route allowlist

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/auth`, `app/apps/mastra` (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-03 (§4.2, §4.3); resolves SP0 follow-up #12 a, b and e (c gets a regression test; d is the `/v1` gateway error mapping, spec §4.1)

## Context

Mastra stays private behind `/v1` (umbrella §16.3), yet it still authenticates each call, so a leaked internal URL is useless without a user token. The SP0 spike found that a subclass `mapUserToResourceId` is shadowed by the base constructor; that Mastra also accepts `?apiKey=<token>`, which leaks tokens into logs; that the Auth emulator accepts unsigned tokens; and that the emulator always checks revocation, so read/mutation behavior needs a fake verifier to be tested. `@mastra/auth-firebase` is not adopted (umbrella §16.2).

## Decision

1. `FirebaseMastraAuth extends MastraAuthProvider`. `authenticateToken` reads `Authorization` from the raw request and returns `null` unless it is exactly `Bearer <token>` (blocks `?apiKey=`).
2. Tokens are verified through SP1 `verifyBearer()` (Firebase ID tokens and prefixed service API keys). `checkRevoked` is `true` for every POST (mutations and agent runs) and `false` for GETs.
3. The principal is resolved with SP1 `resolveAccessContext`; a missing membership yields a principal without permissions (403), an invalid token yields `null` (401). `authorizeUser` requires the membership plus `core.chat.use` (`core.mcp.use` on the MCP route).
4. `mapUserToResourceId` is passed through `super({ mapUserToResourceId })` and returns `${tenantId}:${uid}`.
5. `route-allowlist-middleware` returns 404 for built-in route groups the core does not use (`/api/vectors/*`, direct `/api/tools/*` execution, `/api/v1/responses`, `/api/v1/conversations`, stored agents) and keeps agents, memory reads, workflows, schedules, MCP, observability, datasets and the core custom routes.

## Consequences

- Tokens never travel in query strings; revocation is checked where it matters without a round trip on every read.
- `FIREBASE_AUTH_EMULATOR_HOST` outside `local` stays rejected by `ServicesEnvSchema`; SP3 adds a regression test (follow-up 12c).
- Each Mastra upgrade must re-check the built-in route list against the allowlist.

## Alternatives rejected

- **`@mastra/auth-firebase`.** Rejected in umbrella §16.2: it has no hook for tenant resolution and does not restrict the token source.
- **No auth inside Mastra (network-only trust).** One misconfigured ingress would expose every agent and memory route.
- **`checkRevoked` on every call.** Adds an Auth round trip to every GET for no security gain on reads.
