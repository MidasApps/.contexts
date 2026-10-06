# 0059. Web App Check and web push deferred to the first remote environment

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/apps/web`, `app/packages/client`, `app/packages/services` (local decision; the framework is unchanged)
- **Related:** decision 0018 (mobile targets deferred, desktop without push or App Check); harness prompt "Firebase: todas as stacks aplicáveis"

## Context

The harness prompt lists App Check and FCM among the Firebase products the core should use. Decision 0018 settled desktop and mobile: no push and no App Check in v1. The web app was left open.

Both products need a real Firebase project:

- **App Check on the web** needs a reCAPTCHA Enterprise site key for the app's domain. `firebase-admin` `getAppCheck().verifyToken` checks tokens against the project's keys. The Emulator Suite has no App Check emulator. The debug provider still issues tokens from the real backend, so it needs a registered debug token.
- **FCM web push** needs a VAPID key pair from the project's Cloud Messaging settings, a service worker served from the web origin, and the FCM backend to deliver. The Emulator Suite has no messaging emulator.

The core's delivery criterion is a local, end-to-end run with no remote environment. Provider code that cannot run in that loop would ship untested.

## Decision

1. **v1 ships without App Check and without web push.** `/v1` does not require an `X-Firebase-AppCheck` header. Approvals, schedule runs and ingestion results reach the user in the app instead:
   - the approvals inbox polls;
   - the chat and the run pages show state;
   - toasts appear while the page is open.
2. **The hook points are fixed now**, so the first remote environment adds code without reshaping anything:
   - **App Check.** The client sends `X-Firebase-AppCheck` from `getToken(appCheck, false)` on the web build only. The desktop sends nothing (decision 0018).
     - The check runs in `api-route.ts` after authentication and before validation.
     - It is optional per client type, behind `APP_CHECK_ENFORCE` (`off` | `web`; default `off`).
     - When enforced, a web request without a valid token answers `401` with code `APP_CHECK_FAILED`.
   - **Web push.** A `push_tokens` subcollection under the user stores `{ token, platform: "web", locale, createdAt, lastSeenAt }`. Registration goes through `PUT /v1/me/push-tokens/{token}` and removal through `DELETE /v1/me/push-tokens/{token}`.
     - A Functions trigger on `approvalRequests` creation sends to the approvers' tokens.
     - Tokens that FCM answers `messaging/registration-token-not-registered` for are deleted.
     - The client asks for notification permission only from an explicit "Ativar notificações" action in the profile, never on load.
3. **Done when** a sandbox Firebase project exists (the same one the App Hosting spike needs, follow-up #13). The work is then a new subproject with its own plan:
   - register the site key and the VAPID key as secrets;
   - add the hook points above;
   - verify App Check and push against that project.

## Consequences

- Follow-up #14's web half and the prompt's App Check and FCM items are tracked by this decision, not by code.
- Nothing in the core depends on push: every notification has an in-app path (the same rule decision 0018 set for desktop).
- An app built from the core can turn on App Check without touching route handlers: the check sits in the shared route pipeline.

## Alternatives rejected

- **Ship the client and server code now, untested.** It would pass a typecheck but nothing would prove it works. A key-mismatch or service-worker scope bug would surface in production first.
- **Fake App Check and FCM adapters in local mode only.** They would test our own fakes, not the provider contract, and add code paths the real environment never takes.
