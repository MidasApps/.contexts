# 0041. `/admin` console composition and staff checks

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/client/src/{views,widgets,features}/admin-*`, `app/apps/web/src/app/admin`, the `/v1/admin/*` handlers in `app/packages/services` (local decision; the framework is unchanged)
- **Records:** SP5 spec D5-08 (§6)
- **Relates to:** decision 0030 (SP1 hardening)

## Context

The platform console is web only and staff only. The UI layer (`@core/client`) is shared with
the desktop app, which must never ship `/admin`.

## Decision

**D5-08.**

- The `/admin` UI lives in `@core/client` (`views/admin-*`, `widgets/admin-*`,
  `features/admin-*`). Only `apps/web/src/app/admin/**` composes it, and those files hold no
  logic. The desktop app has no `/admin` route.
- Staff with MFA is checked twice:
  - `requirePlatformStaffSession()` in the `/admin` layout (non-staff get 404, SP2 §7);
  - every `/v1/admin/*` handler authorizes a `platform.*` permission, which requires staff with
    MFA.
- Every staff mutation writes `platform-audit-logs` with `targetTenantId`.
- Tenant endpoints never take a tenant id from the path or the body; they use the active tenant.

## Consequences

- A layout bug cannot expose data, because the API refuses on its own.
- Admin views are tested like any other client view.

## Alternatives rejected

- **A separate admin app.** It would duplicate the shell, i18n and the design system.
- **Checks in the layout only.** A direct `/v1/admin` call would bypass them.
