# 0007. Authentication sessions: web cookie with custom-token exchange, desktop session secret

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/services` (context `identity`), `app/apps/web`, `app/apps/desktop` (local decision of
  the boilerplate; the framework in `.contexts/` is unchanged)
- **Refines:** SP1 spec §3.3–§3.5; umbrella spec §16.2 (`/v1` is Bearer-only)

## Context

`rules/security.md` §2 forbids tokens in web storage. Firebase JS SDK persistence (`indexedDB`, `local`) stores the
refresh token in the browser, and `/v1` accepts only `Authorization: Bearer` (umbrella §16.2), so it cannot read a
cookie. The web still needs server-rendered pages that know the user, and the desktop app needs to stay signed in
across restarts without a browser cookie jar. Staff access needs MFA, which a custom-token sign-in cannot carry.

## Decision

1. **Web.** The browser signs in with the Firebase JS SDK using `inMemoryPersistence`. A Server Action
   `createSession({ idToken })` verifies the token with `checkRevoked`, requires `auth_time` within 5 minutes, calls
   `createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_DAYS })` (default 5, range 1–14), stores a `sessions`
   record (`kind: "web"`, `cookieHash = sha256(cookie)`, `mfa`) and sets `__session` (`HttpOnly; Secure; SameSite=Lax;
   Path=/`; `Secure` is dropped only for `APP_ENV=local` over http). Next's Server Action origin check plus an
   explicit `Origin` check against `NEXT_PUBLIC_APP_URL` is the CSRF guard.
2. **Exchange.** On a fresh page load the SDK has no user. Server Action `exchangeSession()` verifies the cookie
   (`verifySessionCookie(cookie, true)`), loads the session record by `cookieHash` (not revoked) and returns
   `createCustomToken(uid, { smfa: session.mfa })`. The client signs in with it (in memory) and uses the ID token as
   the `/v1` Bearer. RSC guards `requireWebSession()` and `requirePlatformStaffSession()` read the same cookie.
3. **MFA carry-over.** Staff checks accept `firebase.sign_in_second_factor` (`totp` or `phone`), or
   `firebase.sign_in_provider === "custom"` with developer claim `smfa === true`. `smfa` is set only from a verified
   session record. TOTP is used in remote environments (Identity Platform); the Auth Emulator emulates SMS only, so
   `local` uses SMS. `MFA_FACTORS` (`totp|phone` list, default `totp`; `.env.example` sets `phone`) tells the UI
   which factor to offer.
4. **Revocation.** Firebase has no per-session revocation, so our `sessions` records are checked on every exchange
   and guard. Sign-out marks the record revoked and deletes the cookie. "Sign out everywhere" also calls
   `revokeRefreshTokens(uid)`, which invalidates every session cookie and ID token.
5. **Desktop.** After an in-memory sign-in, `POST /v1/me/desktop-sessions` (Bearer) returns `{ sessionId, secret,
   expiresAt }` once. The 256-bit secret lives in the OS keychain; the server stores `sha256(secret)`. On start,
   `POST /v1/desktop-sessions/exchange { secret }` (no Bearer, rate limited per IP) checks hash (constant time),
   expiry (`DESKTOP_SESSION_MAX_AGE_DAYS`, default 30, sliding), revocation, disabled user and
   `createdAt > tokensValidAfterTime`, rotates the secret and returns `{ customToken, secret, expiresAt }`. Reusing a
   rotated secret revokes the session and is audited (theft signal).

## Consequences

- Page loads cost one Server Action round trip and one custom-token sign-in before the first `/v1` call.
- The server keeps a `sessions` collection, which also powers the "your sessions" list and per-session revoke.
- Real TOTP is verified only in the first remote environment (deploy checklist); locally MFA is tested with SMS.

## Alternatives rejected

- **IndexedDB / local persistence.** Leaves a long-lived refresh token in web storage (`rules/security.md` §2).
- **Cookie accepted by `/v1`.** Mixes two auth schemes on the public API, brings CSRF into every mutation and
  breaks the Bearer-only contract that desktop, API keys and devices share.
- **`POST /v1/auth/refresh` returning ID tokens from a cookie.** Re-creates a token endpoint around Firebase's own,
  and still needs the cookie on `/v1`.
- **Refresh token in the desktop keychain.** Firebase refresh tokens cannot be scoped, listed or revoked one by
  one; our session secret can.

## Amendments

- **2026-09-29 (SP1 review of Tasks 1–3).** Units of `expiresIn`: `createSessionCookie` takes milliseconds, so the
  call in Decision 1 is `createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_DAYS * 86_400_000 })` (days ×
  86 400 000 ms; 5 days = 432 000 000 ms, the Firebase range is 5 minutes to 14 days). The cookie `Max-Age` uses the
  same value in seconds (`SESSION_MAX_AGE_DAYS * 86_400`).
