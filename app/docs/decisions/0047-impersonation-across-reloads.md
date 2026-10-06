# 0047. Impersonation across reloads: the web session remembers it

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/services` (identity sessions), `app/apps/web` (session Server Actions),
  `app/packages/client` (session provider, admin impersonation, banner)
- **Refines:** SP1 spec §3.3 and §6.6, decision 0007 (web session cookie), decision 0042 (admin console UI)

## Context

Support access (SP1 spec §6.6) starts with `POST /v1/platform/impersonation-sessions`, which returns
a one-time custom token for the user, with the claims `imp` (session id) and `impBy` (staff uid).
The admin page signed the tab in with that token. The staff `__session` cookie stayed as it was, so:

- a reload ran `exchangeSession()` on that cookie and the tab went back to the staff account;
- the banner's only way out was a full sign-out, which also revoked the staff web session.

`/v1` is Bearer-only and never reads the cookie (umbrella §16.2), so the server-side state that
survives a reload is the web session record, not the API.

## Decision

1. **The web session record remembers the impersonation.** `sessions/{id}` gains an optional
   `impersonationSessionId` (web records only; absent or `null` = the staff account). The staff
   `__session` cookie is never replaced or re-issued.
2. **Server Action `enterImpersonation({ impersonationSessionId })`.** Same origin check as the other
   session actions. It loads the cookie's open web session, requires its user to be active platform
   staff with MFA (the `/admin` rule), and the impersonation session to belong to that staff member,
   not ended and not expired (otherwise `NOT_FOUND`, `FORBIDDEN` or `UNAUTHORIZED`). It stores the
   marker and returns a custom token for the user with the same claims the start used
   (`imp`, `impBy`). No audit entry: the start is audited, and `/v1` audits every impersonated request.
3. **`exchangeSession()` restores the user while the session is usable.** With a marker, the
   exchange mints the impersonated token only if the impersonation session is open, unexpired,
   belongs to the cookie's staff member and that member is still active staff with MFA. Otherwise it
   clears the marker and mints the staff token: it fails closed to staff, never to the user. A
   session found past `expiresAt` that nobody ended is audited once as `IMPERSONATION_EXPIRED`
   (platform log) when its marker is cleared.
4. **Server Action `leaveImpersonation()`.** Ends the impersonation session in a transaction with the
   same two audit entries as `POST /v1/platform/impersonation-sessions/{id}/end`
   (`IMPERSONATION_ENDED`, platform and tenant logs; once, idempotent), clears the marker and returns
   the staff token. The client signs in with it in memory, clears the query cache and lands on
   `/admin/users`, with no new sign-in.
5. **Client.** The session bridge port has optional `enterImpersonation` / `leaveImpersonation`
   (web only; desktop has no `/admin`). The session controller switches the Firebase user with them
   (`USER_SWITCHED`). "Open the app as this user" works while the stored session is open, also after a
   reload, and keeps no token in the browser. The banner's "Leave support mode" leaves; when the staff
   session cannot be restored it signs out completely.
6. **Unchanged.** Read-only enforcement (`authorize()` refuses writes for `imp` tokens and checks the
   session doc on every request), the 60-minute cap, Security Rules denying `imp` tokens.

## Consequences

- A reload keeps the user for at most the session's remaining time; past `expiresAt` the next
  reload shows the staff account, and `/v1` already refuses the user's token.
- Ending a session from `/admin/users` (or a colleague ending it) also returns the tab to staff on
  the next reload; until then the tab's ID token is refused by `/v1`.
- One more Firestore read per page load while the marker is set; none otherwise.
- The staff web session stays signed in throughout; signing out while impersonating revokes it as
  before.
- Signing in with a custom token on the client still yields a Firebase user without the staff
  second factor; staff pages require the cookie's MFA proof, which is unaffected.

## Alternatives rejected

- **A second cookie with the impersonated session id.** Hosting forwards only `__session`, and a
  client-readable marker could be swapped; the record is server-side and already loaded.
- **Persisting the one-time custom token in `sessionStorage`.** A credential in web storage
  (`rules/security.md`), and it would still not restore after the token's one-hour life.
- **A separate impersonation session cookie replacing `__session`.** Loses the staff session, so
  "leave" would again need a full sign-in.
