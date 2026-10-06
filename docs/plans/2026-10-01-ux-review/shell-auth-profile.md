# UX review: app shell, auth and profile (scope "shell")

Reviewer: product design + front-end review, read-only. Branch `feat/agentic-app-core-sp0`, 2026-10-01.
Method: read the code and colocated tests of every screen, block and component in scope. Paths below are
relative to `app/packages/client/src/` unless they start with `app/` or `docs/`.
Component tests in scope ran green: `pnpm -C packages/client exec vitest run src/app-shell src/views/sign-in
src/views/invite src/views/home src/views/organizations src/views/organization-home src/views/profile-security
src/widgets/user-menu src/widgets/app-sidebar src/shared/ui/molecules src/shared/ui/organisms/ConfirmDialog
src/shared/ui/organisms/DataTable --maxWorkers=2` → 53 files, 147 tests passed. No browser run (memory).

## Summary

| Screen / block / component | States covered | Verdict |
|---|---|---|
| Sign-in (`views/sign-in`, `features/auth-by-email`) | booting/redirecting spinner, signed-out notice (expired / signed out), field validation, generic credential error (focused), pending + double-submit guard, `?next=` internal only | Good form; **no password reset, no sign-up** (SH-01, SH-02); no brand or language picker (SH-12) |
| MFA challenge (`features/mfa-challenge`) | factor choice, SMS send/resend pending, code validation, wrong code as field error, other failures as focused alert, cancel | Good |
| Invitation (`views/invite`, `features/accept-invitation`) | missing token, sign-in in place, MFA, preview loading, final vs retryable errors, mismatch "use another account", accept pending, success toast | Good, but dead end for invitees with no account (SH-01) |
| Home redirect (`views/home`) | spinner, error + retry | Loops on a stale `lastContext` (SH-05) |
| Organizations / onboarding (`views/organizations`, `features/create-organization`) | skeleton, error + retry, empty, load more, last-used badge, create form with idempotent retry, success toast | Create form shown even when self-serve is off (SH-07) |
| Organization home (`views/organization-home`) | skeleton grid, error, empty with/without permission, load more, project-only member redirect, 404/403 | Good |
| Project home (`views/project-home`) | QueryPage states, units loading/error/empty, modules empty | Good |
| Not found / forbidden / page error (`widgets/page-state`) | 404, 403, error with reference + retry + home | "Go home" can loop (SH-05); no Next `error.tsx` (SH-06) |
| Offline (`app-shell/offline-banner`, `OfflineNotice`) | polite live region, retry refetches active queries | Good |
| Shell error boundary (`app-shell/shell-error-boundary`) | fallback with requestId, retry remounts | Good (client only; see SH-06) |
| App layout / templates (`AppShellTemplate`, `AuthTemplate`, `SettingsTemplate`) | skip link, one `main`, sticky topbar, right panel sheet below `lg` | Boot fallback causes layout shift (SH-13) |
| Sidebar + switchers (`widgets/app-sidebar`, `organization-switcher`, `project-switcher`, `unit-picker`) | nav skeleton, nav retry, switcher loading/error/empty items, create project, unit tree loading/error/empty | Unit picker placement on mobile (SH-17); switch has no pending feedback (SH-16) |
| Topbar (`widgets/app-topbar`) | crumb skeletons, collapsed crumbs on mobile, palette trigger with shortcut | Good |
| Command palette (`widgets/command-palette`) | recents, loading/error rows per group, empty, focus return | Good |
| User menu + approvals badge (`widgets/user-menu`) | skeleton, waiting count with plural label, theme submenu, language link, sign out | Theme save fails under impersonation (SH-08) |
| Impersonation banner (`widgets/impersonation-banner`) | live region, expiry when known, leave button | Does not name the account; scrolls away (SH-14) |
| Profile account / preferences / notifications (`views/profile-*`, `features/update-*`) | QuerySection states, SchemaForm states, optimistic switch with revert, theme applied at once | Stale "Saved" status (SH-10); switch double toggle (SH-15); live forms under impersonation (SH-08) |
| Profile security (`features/mfa-enrollment`, `features/change-password`) | factors empty/list, enroll dialogs with retry, remove confirm (last-factor warning), password checks, re-auth MFA dialog | **TOTP has no QR code** (SH-03); issuer name (SH-20) |
| Profile sessions (`views/profile-sessions`, `features/revoke-session`) | DataTable loading/error/empty/paging, cards on mobile, revoke confirm with inline error, sign out everywhere | Table error ignores error code (SH-11) |
| Kit: Button, Spinner, Skeleton, LoadingState, EmptyState, ErrorState, ApiErrorState/Alert, NoAccessState, StatePanel | pending/aria-busy, translated labels, reduced motion (globals.css:241) | Good |
| Kit: Dialog, AlertDialog, ConfirmDialog, Sheet | focus trap, focus return, pending, inline error, Esc blocked while pending | Dialog has no max height / scroll (SH-04) |
| Kit: Toaster / notify | success 4 s, warning 8 s, error persistent with close | Good |
| Kit: DataTable + pagination | caption, skeleton rows, error, empty, cursor paging, cards below `md` | SH-11 |
| Kit: SchemaForm + Field | per-field messages, server field mapping, focus first error, double-submit guard, loading | SH-10 |
| Desktop shell (`app/apps/desktop/src`) | user-area gate (wait / sign-in with `next`), config error screen, route announcer, OS/profile locale | No language picker before sign-in (SH-12) |
| i18n | no hard-coded copy found in scope; pt-BR/en-US/es-419 catalogs present; ICU plurals for counts | Good |

## Findings

### SH-01 — blocker — auth / onboarding
- **File:** `views/invite/ui/InviteView.tsx:37-44`; `app/apps/web/src/app/[locale]/(auth)/` holds only `sign-in` and `invite`.
- **Problem:** No account can be created from the UI. A signed-out invitee only gets `SignInForm` ("Use a conta do e-mail que recebeu o convite", `pt-BR/auth.json:56-57`). No code calls `createUserWithEmailAndPassword` (grep finds it only in a test fixture, `packages/services/.../auth-emulator-rest.fixture.ts:16`). No sign-up route exists either. There is no staff provisioning path to make up for it: `app/apps/web/src/app/v1/admin/users/route.ts:4` exports only `GET` (`admin.listUsers`), and `packages/contracts` has no create-user endpoint.
- **User impact:** A person invited by email who has no account yet cannot accept the invitation. The invite flow, which is the main way to bring a teammate in, stops there. A brand-new user cannot reach the self-serve onboarding (`/organizations`) either.
- **Fix:** On `/invite`, add "Criar conta" next to sign-in. The invitee types the email and a password. The preview exposes only `maskedEmail` (`features/accept-invitation/ui/AcceptInvitation.tsx:103`), so show it as a hint, and let the server's existing `EMAIL_MISMATCH` check on accept confirm the match. Then run `completeSignIn` and land on the preview. If self-serve sign-up is wanted, add `/sign-up` behind the same flag the server uses. Add both to `ENTRY_ROUTES` (`views/sign-in/ui/SignInView.tsx:17`) and to the desktop entry routes (`app/apps/desktop/src/app/desktop-shell.tsx:26`).

### SH-02 — major — auth
- **File:** `features/auth-by-email/ui/SignInForm.tsx:89-111`.
- **Problem:** The sign-in form has no "Esqueci minha senha" link, and the auth port has no reset method. Grep finds no `sendPasswordResetEmail` anywhere.
- **User impact:** A user who forgets their password is locked out with no path inside the product. Repeated tries end in `RATE_LIMITED`.
- **Fix:** Add a "Esqueci minha senha" link under the password field, pointing to a `/reset-password` entry view (email field → `sendPasswordResetEmail` → always the same neutral confirmation, so it does not reveal which accounts exist). Add the action to `AuthPort` and `fake-auth.ts`, and add copy in all three locales.

### SH-03 — major — profile/security (MFA)
- **File:** `features/mfa-enrollment/ui/EnrollTotpDialog.tsx:99-109`; copy `pt-BR/profile.json:72`.
- **Problem:** TOTP enrollment gives only an `otpauth://` link ("Abra o link no app autenticador deste dispositivo") and the setup key. There is no QR code.
- **User impact:** On a desktop browser or the desktop app the link opens nothing, because the authenticator is on the phone. The user has to type a 32-character key by hand, which is slow and easy to get wrong. This is the main way people enroll TOTP.
- **Fix:** Render `enrollment.uri` as a QR code (a small client-side SVG QR generator, with `role="img"` and a translated label). Keep the link for mobile and the copyable key as a fallback. Update step 1 to say "Escaneie o QR code…".

### SH-04 — major — kit / dialogs / responsive
- **File:** `shared/ui/styles/modal-classes.ts:11-17` (`centeredModalClasses`), used by `molecules/Dialog/Dialog.tsx:37`.
- **Problem:** The centered modal is `fixed top-1/2 -translate-y-1/2` with no `max-h-*` and no `overflow-y-auto`.
- **User impact:** Tall dialogs (TOTP enrollment: two steps, link, key, name, code, footer; SMS enrollment; change-password MFA; create project with errors) are taller than a 360×640 phone or a short laptop window. Their top (title) and bottom (submit) are cut off and cannot be scrolled to, so the dialog cannot be completed.
- **Fix:** Add `max-h-[calc(100svh-2rem)] overflow-y-auto` (or keep the header and footer sticky and scroll only the body) to `centeredModalClasses`. Add a 360×640 e2e or visual check of the TOTP dialog.

### SH-05 — major — navigation / not-found
- **File:** `views/home/ui/HomeView.tsx:13-31`; `widgets/page-state/ui/PageState.tsx:38-51`; `views/organization-home/ui/OrganizationHomeView.tsx:125-136`. Server: `packages/services/src/services/access/application/membership-writes.ts:71-72` sets `lastContext.organizationId` only when activating; removal leaves it unchanged.
- **Problem:** `/` always redirects to `me.lastContext`. If that organization is no longer visible (the member was removed, or the organization was deleted), the page renders `PageNotFound`. Its only action, "Ir para o início", goes to `/`, which redirects back to the same not-found page.
- **User impact:** A removed member who signs in lands on a not-found page whose main button loops forever. The only way out is the sidebar switcher, which the page never mentions.
- **Fix:** In `HomeView`, check the target before redirecting. Either the server clears or validates `lastContext` in `GET /v1/me` (preferred), or the client falls back to `{ id: "organizations" }` when the access context of `lastContext` answers 404. Also give `PageNotFound` a second action, "Ver organizações" (`{ id: "organizations" }`).

### SH-06 — major — error pages (web)
- **File:** `app/apps/web/src/app/[locale]/` has `not-found.tsx` but no `error.tsx` and no `global-error.tsx` (checked with find). `(app)/layout.tsx:10-15` awaits `requireWebSession` on the server.
- **Problem:** Errors thrown during server rendering (session check, root params, a backing service down) do not reach the client `ShellErrorBoundary`. Next shows its built-in error screen, which is English and unbranded and has no retry or reference.
- **User impact:** During an outage, users see an untranslated generic page with no way to retry, outside the design system.
- **Fix:** Add `[locale]/error.tsx` (client, `ErrorState` with `reset()` as retry and the digest as reference, translated) and `app/global-error.tsx` (minimal HTML, pt-BR copy inline as the documented exception). Cover both with an e2e that forces a server error.

### SH-07 — major — onboarding / no-permission
- **File:** `views/organizations/ui/OrganizationsView.tsx:77-85`; `features/create-organization/ui/CreateOrganizationForm.tsx:48-64`. Server flag: `packages/services/src/services/tenancy/application/use-cases/create-organization.ts:23` (`ORGANIZATION_SELF_SERVE`).
- **Problem:** The create-organization card is always rendered. The client never learns whether self-serve is enabled, so when it is off the user fills the form and gets the generic `FORBIDDEN` copy ("Você não tem permissão para fazer isso.").
- **User impact:** A dead form on the first screen a new user sees. In closed deployments the empty state ("Nenhuma organização…") plus a form that always fails gives no next step.
- **Fix:** Expose the flag, either in `GET /v1/me` (`capabilities.createOrganization`) or in the client config. Hide the card when the flag is off. Replace the empty-state description with "Peça um convite a quem administra sua organização" and add an action (for example, sign out or switch account).

### SH-08 — minor — impersonation / profile
- **File:** `features/update-preferences/model/use-save-theme-preference.ts:22-30`; `views/profile-account/ui/ProfileAccountView.tsx:35-37`; `views/profile-preferences/ui/ProfilePreferencesView.tsx:21-29`; `features/update-preferences/ui/NotificationPreferencesForm.tsx:24-35`. Server refuses: `packages/services/src/services/identity/application/use-cases/update-me.ts:49` (`IMPERSONATION_READ_ONLY`).
- **Problem:** While support staff impersonate a user (read-only), the profile forms, the notification switch and the theme submenu stay active. Every save fails with the generic FORBIDDEN copy. The theme toast offers "Tentar novamente", which fails the same way every time.
- **User impact:** The UI shows live buttons that cannot work, and the staff member gets a vague error instead of "read-only".
- **Fix:** Expose the `imp` claim (the hook in `widgets/impersonation-banner/ui/ImpersonationBanner.tsx:13-30`) as a shared `useIsImpersonating()`. In the profile views, render forms as read-only with a one-line notice. Make the theme change local only (no PATCH, no toast) while impersonating.

### SH-09 — minor — error states (session expired)
- **File:** `shared/ui/molecules/ErrorState/ApiErrorState.tsx:16-18`; `widgets/page-state/ui/QueryPage.tsx:33-39`; copy `pt-BR/errors.json:2` ("Sua sessão expirou. Entre novamente para continuar.").
- **Problem:** A 401 that survives the forced token refresh (`shared/api/http-client.ts:100`) renders as a normal error, and its only action is "Tentar novamente". The copy tells the user to sign in, but no sign-in action is offered. The session is not ended either: `useAuthLossWatch` reacts only to a Firebase sign-out (`app-shell/session/session-effects.ts:65-73`), and grep finds no other 401 handling in `shared/api` or `app-shell` beyond the one retry (`http-client.ts:100`, `chat-transport.ts:125`).
- **User impact:** After a revocation (for example "sign out everywhere" from another device), pages show a retry that keeps failing.
- **Fix:** For `status === 401` (code `UNAUTHORIZED`), have `QueryPage`/`QuerySection`/`ApiErrorState` offer "Entrar novamente". That action calls `session.signOut()` and navigates to `{ id: "sign-in", next: <current path> }`. Alternatively, end the session centrally in the HTTP client.

### SH-10 — minor — forms feedback
- **File:** `shared/ui/organisms/SchemaForm/SchemaForm.tsx:132-139` and `SchemaFormStatus.tsx:214-224`; `features/update-profile/ui/UpdateProfileForm.tsx:17`; `features/update-preferences/ui/RegionalPreferencesForm.tsx:35-36`.
- **Problem:** The `saved` status is cleared only on the next submit, so "Salvo" stays visible while the user edits the form again. Submitting unchanged values returns `{ ok: true }` without a request and still shows "Salvo".
- **User impact:** The confirmation becomes untrustworthy: it shows "Salvo" next to unsaved edits, or after nothing was saved.
- **Fix:** In `SchemaForm`, reset the status to `idle` when the form becomes dirty (`form.watch` subscription or `formState.isDirty`). Disable the submit button while the form is not dirty, or let callers return `{ ok: true, unchanged: true }` and show nothing in that case.

### SH-11 — minor — kit / tables
- **File:** `shared/ui/organisms/DataTable/DataTable.tsx:14-17, 116, 199`; caller `views/profile-sessions/ui/ProfileSessionsView.tsx:104-108`.
- **Problem:** `DataTableStatus.error` carries only `requestId`, so the table renders the generic `common.errorState.description` and never the copy for the error code (FORBIDDEN, NETWORK_ERROR, RATE_LIMITED…). This breaks the rule that error messages come from the error code, which `ApiErrorState` follows.
- **User impact:** Offline, rate-limited and permission failures all look the same, so users cannot tell whether retrying will help.
- **Fix:** Change the status to `{ kind: "error"; error: unknown; onRetry? }` and render `ApiErrorState` inside the table (keep `requestId` derived from the error). Update the callers.

### SH-12 — minor — entry pages / locale switching
- **File:** `app/apps/web/src/app/[locale]/(auth)/sign-in/page.tsx` (renders `<SignInView />` with no `brand`/`footer`); `app/apps/desktop/src/routes/sign-in.tsx:5`; `shared/ui/templates/AuthTemplate/AuthTemplate.tsx:23-27`.
- **Problem:** Sign-in and invite pages show no product mark and no language selector. On desktop there is no locale in the URL, so a signed-out user is stuck with the language negotiated from the OS (`app/apps/desktop/src/adapters/desktop-locale.ts:8-9`).
- **User impact:** The first screen looks unbranded, and someone on a machine set to another language cannot switch before signing in.
- **Fix:** Pass a `brand` slot from each app (app name from config) and a `footer` with `LocaleSelect` (`shared/ui/molecules/LocaleSelect`) wired to `router.switchLocale`, on both hosts.

### SH-13 — minor — loading / layout shift
- **File:** `app/apps/web/src/client/shell-skeleton.tsx:10-17`, used as the Suspense fallback in `app/apps/web/src/app/[locale]/(app)/layout.tsx:24`; desktop gate `app/apps/desktop/src/app/desktop-shell.tsx:38-42`.
- **Problem:** While the session is checked, the user area shows a full-screen centered spinner. The sidebar, topbar and page header then pop in.
- **User impact:** Every cold load or refresh has a full layout jump, and the spinner is shown instead of the structure.
- **Fix:** Render a static shell skeleton: a sidebar column (260 px, or 60 px from the cookie), a 56 px topbar and a page header skeleton, using the same `AppShellTemplate` geometry without data. Use it on both hosts.

### SH-14 — minor — impersonation banner
- **File:** `app-shell/app-layout.tsx:75` (banner inside the scrolling `main` content); `widgets/impersonation-banner/ui/ImpersonationBanner.tsx:47-53`; copy `pt-BR/admin.json:494-495` ("como outro usuário").
- **Problem:** The banner does not say whose account is being viewed, and it scrolls away with the content. The only other cue is the name in the user menu.
- **User impact:** Staff can lose track of which account they are in, or that they are impersonating at all, once they scroll down a long page.
- **Fix:** Name the account ("Você está vendo o app como {name} ({maskedEmail})…", from `me`). Pin the banner: render it in the topbar area, or make it `sticky top-14` with a matching z-index, and give it a distinct tone or border so it stays visible.

### SH-15 — minor — double submit (toggle)
- **File:** `features/update-preferences/ui/NotificationPreferencesForm.tsx:24-35, 45`.
- **Problem:** The product-updates `Switch` stays enabled while its PATCH is in flight (`aria-busy` only). Fast toggles fire overlapping requests, and they can settle out of order. Each one also fires a toast.
- **User impact:** The final saved value can differ from what the switch shows, and the user gets a stack of contradictory toasts.
- **Fix:** Disable the switch while `pending`, or serialize the saves (send only the latest value) and show one toast.

### SH-16 — polish — organization switch feedback
- **File:** `features/switch-organization/model/use-switch-organization.ts:28-38`; `widgets/organization-switcher/ui/OrganizationSwitcher.tsx:48`.
- **Problem:** The switch (PUT + token refresh + invalidating every query) shows no pending state, and a second pick while one is running starts another mutation.
- **User impact:** On slow networks pages refetch twice and the user cannot tell whether the switch worked.
- **Fix:** Disable the radio items and show a spinner on the trigger while `switchOrganization.isPending`.

### SH-17 — polish — responsive (unit picker)
- **File:** `widgets/unit-picker/ui/UnitPicker.tsx:80` (`side="right"`, `w-80`), compared with `OrganizationSwitcher.tsx:92` and `ProjectSwitcher.tsx:84`, which use `isMobile ? "bottom" : "right"`.
- **Problem:** Inside the mobile sidebar sheet, the 320 px tree popover opens to the right of a sheet that already fills most of a 360 px screen. It depends on Radix collision flipping, and it behaves differently from the other switchers.
- **Fix:** Use `useSidebar().isMobile` → `side="bottom"` and `w-[min(20rem,calc(100vw-2rem))]`.

### SH-18 — polish — consistency (profile navigation)
- **File:** `widgets/profile-nav/ui/ProfileNav.tsx:11-27` hard-codes `PROFILE_SECTIONS` and its own icon map; `app-shell/navigation/core-navigation.ts:27-33, 76-83` builds the same items in the `user-menu` slot.
- **Problem:** There are two sources for the profile sections. A module that adds a `user-menu` profile item appears in the user menu but not in the profile section nav, and icons can drift.
- **Fix:** Build `ProfileNav` from `useNavigationRegistry().visibleItems("user-menu", …)` filtered to `target.kind === "profile"`, the same way `SettingsNav` does (`widgets/settings-nav/ui/SettingsNav.tsx:28-33`).

### SH-19 — polish — long text
- **File:** `widgets/page-header/ui/PageHeader.tsx:26-28`.
- **Problem:** The `h1` has no `break-words`/`min-w-0`. Organization and project names are user data and are shown elsewhere with `truncate` (`OrganizationsView.tsx:30`, `OrganizationHomeView.tsx:30`), but the page title is not protected.
- **User impact:** A long name without spaces overflows the page horizontally at 360 px.
- **Fix:** Add `min-w-0 break-words [overflow-wrap:anywhere]` to the `h1` (keep the full text: it is the page title).

### SH-20 — polish — MFA copy
- **File:** `features/mfa-enrollment/ui/EnrollTotpDialog.tsx:21` (`issuer = useClientConfig().firebase.projectId`).
- **Problem:** The authenticator app lists the entry under the Firebase project id (for example `demo-core` or a GCP id), not the product name.
- **User impact:** Users cannot recognize which code belongs to this app, especially if they have several.
- **Fix:** Add `appName` to the client config (`shared/config/client-config.schema.ts`) and use it as the issuer.

### SH-21 — polish — test coverage (a11y)
- **File:** `app/apps/web/e2e/a11y.spec.ts:22-31, 91-95`.
- **Problem:** The axe matrix covers shell, settings and profile pages, but not `/invite` (preview and error states), the MFA challenge step, not-found/forbidden, the open dialogs (TOTP enrollment, ConfirmDialog), the impersonation banner, or es-419.
- **Fix:** Add these cases. For the dialogs, open them and run axe while they are open, as the existing command-palette case does (`a11y.spec.ts:70`).

## Counts

blocker 1 · major 6 · minor 8 · polish 6 (total 21)
