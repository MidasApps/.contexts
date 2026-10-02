# B4 fixes: profile security and impersonation awareness

Batch B4 of [`consolidated.md`](consolidated.md): U-05, U-66, U-20, U-46, U-47. Every finding was
checked against the code on `feat/agentic-app-core-sp0` at `ace7eb1b` before the fix: all five
still applied (none were already fixed). Paths are relative to `app/packages/client/src/`.

| Finding | Status | Commit | Test |
|---|---|---|---|
| U-05 TOTP enrollment has no QR code (SH-03) | fixed | `feat(client): show a qr code to enroll an authenticator app` | `shared/ui/atoms/QrCode/QrCode.test.tsx`; `views/profile-security/ui/ProfileSecurityView.test.tsx` ("shows the setup as a QR code…") |
| U-66 TOTP issuer is the Firebase project id (SH-20) | fixed | same commit | `ProfileSecurityView.test.tsx` (asserts `startTotpEnrollment("Core")`) |
| U-20 impersonation awareness (SH-08, SH-14, ADM-06) | fixed | `fix(client): make support mode visible and read-only in the profile`; the stored labels in `fix(admin): hand focus through the support-access steps` | `features/update-preferences/model/use-save-theme-preference.test.tsx`; `views/profile-account/ui/ProfileAccountView.test.tsx`; `views/profile-notifications/ui/ProfileNotificationsView.test.tsx`; `app-shell/app-layout.test.tsx`; `views/admin-users/ui/AdminUsersView.test.tsx` |
| U-46 no focus hand-off in the impersonation flow (ADM-07) | fixed | `fix(admin): hand focus through the support-access steps` | `AdminUsersView.test.tsx` ("moves focus to the chosen user after a pick…") |
| U-47 org error not tied to its field, no duration range hint (ADM-09) | fixed | same commit | `AdminUsersView.test.tsx` ("ties each error to its field…") |

## What changed

- **U-05.** New atom `shared/ui/atoms/QrCode`: encodes with `uqr` 0.1.3 (MIT, no dependencies,
  pinned in the catalog) at error level M with a four-module quiet zone, and draws one SVG
  `path` with `role="img"` and a translated label. The frame sets `data-theme="light"`, so the
  light tokens (`bg-background`, `fill-foreground`) apply in every theme: the code is always dark
  on light, because many authenticator apps cannot read an inverted code. No hard-coded color.
  `EnrollTotpDialog` shows it above the link and the setup key, which stay as fallbacks; step 1
  now starts with "Escaneie o QR code" in all three locales.
- **U-66.** The issuer is the product name from `auth.entry.appName`, the single source of the
  product name chosen by B2 (decision 0050, point 6), not a new `appName` client config field.
  Caveat: the issuer is stored in the authenticator app, so it should not vary by locale; today
  all three catalogs say "Core", and a rename must keep them equal.
- **U-20.**
  - `shared/lib/session/use-impersonation.ts` exposes `useImpersonationSessionId()` and
    `useIsImpersonating()` (the `imp` claim). The banner reuses it.
  - `ProfilePageFrame` shows one read-only notice. Each view wraps only its write surfaces in
    `ReadOnlyFieldset` (a disabled `fieldset` from `widgets/profile-nav`): the account form, the
    regional form and the theme, the notification switches, and the MFA and password sections.
    Retrying a failed load and paging the sessions list keep working. A session revoke still gets
    the server's 403.
  - `useSaveThemePreference` applies the theme locally and skips the PATCH and the retry toast
    while impersonating. This covers the user menu and the command palette.
  - The banner names the user (from `GET /v1/me`, which is the impersonated user). When this tab
    started the session, it also names the organization and the end time. It renders nothing
    while `me` loads, so the live region announces one sentence.
  - The banner is pinned under the topbar (`sticky top-14 z-10`) on an opaque `bg-background`.
  - `StoredImpersonation` keeps optional `targetLabel` and `organizationName`.
    `OpenImpersonationSession` shows the name, with the uid as secondary text.
- **U-46.** Picking a user focuses the chosen-user box of the start form and scrolls it into view.
  Starting a session focuses "Abrir o app como este usuário".
- **U-47.**
  - `AdminOrganizationFilter` takes `invalid`/`describedBy`. The form passes them through a
    render prop, so the combobox carries `aria-invalid` and points at its error.
  - The organization error disappears once an organization is chosen. The user error disappears
    once a user is picked.
  - Reason and duration errors clear on edit.
  - The duration shows "De 1 a {max} minutos." up front (`aria-describedby`).

## Notes for other batches

- `app-shell/app-layout.tsx` (shared with B5): the impersonation banner is now `sticky top-14 z-10`.
  B5's U-44 (chat height calc ignores the banners) must count it as a pinned 56 px+ strip.
- `widgets/profile-nav/ui/ProfileNav.tsx` (B13 touches `ProfileNav` for U-64): B4 changed only
  `ProfilePageFrame` in that file.
- `NotificationPreferencesForm.tsx` (B11, U-23) was not edited. The read-only state comes from
  the frame's `fieldset`.

## Known limits

- The read-only state comes from an async claim read, so the controls can be enabled for a
  moment before they are disabled. The server still refuses every write
  (`IMPERSONATION_READ_ONLY`).
- `ProfileThemeSync` still applies the impersonated user's saved theme in the staff tab. This is
  harmless and was left as is.
