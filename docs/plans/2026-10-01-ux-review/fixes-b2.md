# B2 — Auth entry and onboarding: fixes

Batch B2 of [`consolidated.md`](consolidated.md): U-01, U-04, U-08, U-24. Decision:
`app/docs/decisions/0050-account-creation-and-self-serve-capability.md`. Every finding was
re-checked against the branch head before fixing; none was already fixed.

Commits (oldest first): `4639b307` feat(identity): tell the client whether it may create
organizations · `8591edf9` fix(client): hide organization creation when the server would refuse it ·
`80e3bcba` docs(identity): record account creation and the self-serve capability · `7a7bbd5d`
feat(client): create accounts and send password resets from the auth port · `a801ab10`
feat(client): add sign-up and reset-password entry routes · `5b84a193` feat(client): let invitees
create an account and anyone reset a password · `1903d1ba` feat(web): serve the sign-up and
reset-password pages on both hosts · `2cbb5287` docs(contracts): regenerate the catalog index for Me
capabilities · `46750910` refactor(client): keep refs out of render in the account forms ·
`26ee2ae8` docs(identity): renumber the account creation decision to 0050.

| Finding | Source | Status | Commits | Tests |
|---|---|---|---|---|
| U-01 — no account can be created | SH-01 | fixed | `7a7bbd5d`, `a801ab10`, `5b84a193`, `1903d1ba`, `46750910` | `shared/lib/auth/firebase-account.test.ts`, `features/create-account/ui/CreateAccountForm.test.tsx`, `views/invite/ui/InviteView.test.tsx` (create account on `/invite`, back to sign-in), `views/sign-up/ui/SignUpView.test.tsx` (open and closed), `views/sign-in/ui/SignInView.test.tsx` (sign-up link only when enabled), `shared/lib/router/route-paths.test.ts`, `apps/desktop/src/route-tree.test.tsx`, `apps/web/src/client/client-config.test.ts`, `apps/web/src/web-env.schema.test.ts`, `apps/desktop/src/config/desktop-env.schema.test.ts` |
| U-04 — no password reset | SH-02 | fixed | `7a7bbd5d`, `a801ab10`, `5b84a193`, `1903d1ba` | `shared/lib/auth/firebase-account.test.ts` (neutral answer for unknown emails, UI language), `features/reset-password/ui/RequestPasswordResetForm.test.tsx`, `features/auth-by-email/ui/SignInForm.test.tsx` (forgot-password link), `views/reset-password/ui/ResetPasswordView.test.tsx` |
| U-08 — create-organization form shown when self-serve is off | SH-07 | fixed | `4639b307`, `8591edf9`, `2cbb5287` | `tenancy/.../organization-use-cases.test.ts` (`mayCreateOrganization`, impersonation refused), `identity/.../me-use-cases.test.ts` (`capabilities.createOrganization` for self-serve, closed, MFA staff, PATCH), `views/organizations/ui/OrganizationsView.test.tsx` (no form, invitation copy, sign in with another account) |
| U-24 — entry pages without brand or language picker | SH-12 | fixed | `a801ab10` (switchLocale keeps the invitation fragment), `5b84a193` (auth-entry widget) | `widgets/auth-entry/ui/AuthEntryChrome.test.tsx`, `views/invite/ui/InviteView.test.tsx` (token kept across a language switch), `apps/web/src/client/web-router-adapter.test.tsx` (reload with fragment), `views/sign-in/ui/SignInView.test.tsx`, `views/reset-password/ui/ResetPasswordView.test.tsx` |

Deferred: none.

## Notes

- Server change beyond the review: `POST /v1/organizations` now refuses impersonated callers
  (`IMPERSONATION_READ_ONLY`); the same rule feeds `GET /v1/me` `capabilities.createOrganization`.
- Open sign-up is off unless `NEXT_PUBLIC_SELF_SERVE_SIGN_UP=true` (web) or
  `VITE_SELF_SERVE_SIGN_UP=true` (desktop); `.env.example` and the desktop development env turn it on.
  The e2e env leaves it off, so `/sign-up` shows the invitation-only state there.
- The "forgot password" link on the invitation's sign-in form leaves `/invite` (the token is in
  memory only); after resetting, the user opens the invitation link again.
- The invitation preview needs a session, so the masked invited email cannot be shown before the
  account exists; the server's `EMAIL_MISMATCH` on accept remains the email check.
- The decision was first numbered 0049; B6 landed its own 0049 first, so this one is 0050.
- Not run here (per the brief): Playwright e2e. `apps/web/e2e/settings.spec.ts` keeps working: the
  invite page still opens on "Entre para ver o convite" with the sign-in form.
