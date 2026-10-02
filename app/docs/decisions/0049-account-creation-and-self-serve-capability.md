# 0049. Account creation, password reset and the self-serve capability

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/client` (auth port, entry views, organizations page), `app/apps/web` and
  `app/apps/desktop` (entry routes, public config), `app/packages/services` (identity `GET /v1/me`,
  tenancy creation rule), `app/packages/contracts` (`identity.Me`)
- **Refines:** SP1 spec §6.1 (self-serve organizations) and §6.2 (invitations), decision 0007
  (authentication), decision 0012 (routes)
- **Source:** UX review 2026-10-01, findings U-01 (SH-01), U-04 (SH-02), U-08 (SH-07), U-24 (SH-12)

## Context

The UI could sign people in but never create an account: an invitee without one stopped at the
sign-in form of `/invite`, there was no password reset, and the organizations page always showed
the create form, which fails with `FORBIDDEN` when `ORGANIZATION_SELF_SERVE` is off. The entry pages
had no brand and no language picker, and the desktop has no locale in its URL.

Firebase Auth creates email/password accounts from the client SDK. An account by itself grants
nothing: access comes from invitations (memberships) and, when self-serve is on, from creating an
organization. Whether a project accepts new accounts at all is a Firebase/Identity Platform setting.

## Decision

1. **Accounts are created in the client, through the auth port.** `AuthPort.createAccount({ email,
   password, displayName })` calls `createUserWithEmailAndPassword` and sets the display name before
   the session is established, so the first `GET /v1/me` copies it into `users/{uid}`. The session
   then continues as after an email sign-in (`completeSignIn`). New stable codes:
   `EMAIL_ALREADY_IN_USE`, `ACCOUNT_CREATION_DISABLED` (sign-up turned off in the project).
2. **The invitation page offers account creation.** Signed out, `/invite` shows sign-in with a
   "Create account" switch; the token stays in memory, and the preview and "Accept" follow on the
   same page. The server's `EMAIL_MISMATCH` check on accept stays the only email match (the preview
   needs a session, so it cannot hint the invited address before the account exists).
3. **Open sign-up is a public UI switch, off by default.** `/sign-up` exists on both hosts and shows
   the form only when the client config has `selfServeSignUp: true` (`NEXT_PUBLIC_SELF_SERVE_SIGN_UP`
   on web, `VITE_SELF_SERVE_SIGN_UP` on desktop); otherwise it says accounts come from invitations
   and leads to sign-in. It is not a security control: an operator who must refuse new accounts turns
   email sign-up off in Identity Platform (the form then shows `ACCOUNT_CREATION_DISABLED`), and the
   server rules still decide what a new account may do. `.env.example` and the desktop development
   env turn it on, matching `ORGANIZATION_SELF_SERVE=true` there.
4. **Password reset.** `/reset-password` (both hosts) asks for the email and calls
   `AuthPort.sendPasswordReset(email, locale)` (`sendPasswordResetEmail`, email in the UI language).
   The answer is the same neutral confirmation whether or not an account exists:
   `auth/user-not-found`, `auth/invalid-email` and `auth/user-disabled` resolve like a success; only
   failures the user can act on (offline, rate limited) are shown. The new password is chosen on the
   Firebase action page the email links to.
5. **`GET /v1/me` answers `capabilities.createOrganization`.** It is computed by the tenancy rule that
   `POST /v1/organizations` enforces (`mayCreateOrganization`: self-serve on, else MFA platform staff
   with `platform.organization.read`), so the two never disagree. The rule now also refuses
   impersonated callers (read-only everywhere else). `PATCH /v1/me` returns the same field. The
   organizations page hides the create card when it is false and its empty state asks for an
   invitation, with "sign in with another account".
6. **Entry pages carry a brand and a language picker by default.** The `auth-entry` widget renders the
   product name from copy (`auth.entry.appName`, renamed in the catalogs, not in code) and a
   `LocaleSelect` wired to `router.switchLocale`. Hosts may still pass their own `brand`/`footer`.
   On `/invite`, the switch passes the token as `switchLocale(locale, { hash })`: the web reloads the
   page in the new locale with the fragment (the page reads it once and removes it again); the desktop
   keeps the page mounted and needs none.
7. **Entry routes are one list.** `ENTRY_ROUTE_IDS` (`sign-in`, `invite`, `sign-up`, `reset-password`)
   and `nextRoute` live in `shared/lib/router`; the sign-in view and the desktop shell use them.

## Consequences

- Invitees without an account can join; a deployment with open sign-up lets new users reach the
  self-serve onboarding.
- The "forgot password" link on the invitation's sign-in form leaves the invitation page; the user
  opens the invitation link again after resetting.
- `Me` gained a required response field; every `Me` fixture carries `capabilities`.
- Email verification is not required to accept an invitation (unchanged); the accept check compares
  the token's email with the account's.

## Alternatives considered

- **Server-side sign-up endpoint (Admin SDK).** Adds a public unauthenticated write to `/v1` for what
  the client SDK already does under Firebase's own abuse protection. Rejected.
- **Capability in the client config.** The config is public and per deployment; it cannot express
  the staff exception or impersonation. Kept for open sign-up only, which is decided before sign-in.
- **Carry the invitation token through `?next=` to `/sign-up`.** Puts a one-time secret in a query
  string that reaches logs (SP1 spec §6.2). Rejected in favour of creating the account on `/invite`.
