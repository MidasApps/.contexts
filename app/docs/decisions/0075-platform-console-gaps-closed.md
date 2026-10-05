# 0075. Staff management, platform audit log, plan deletion and dataset rename and delete

- **Status:** accepted
- **Date:** 2026-10-05
- **Scope:** `app/packages/contracts` (`platform/admin-staff*`, `audit` platform query and endpoint,
  `admin.deletePlan`, `evals.renameDataset` / `evals.deleteDataset`, error codes), `app/packages/services`
  (identity staff use cases and routes, audit platform reader, plan delete, console gateway),
  `app/packages/agents` (dataset console routes), `app/packages/client` (`/admin/team`, `/admin/audit`, plan
  and dataset actions, the shared `audit-log-table` widget), `app/firestore.indexes.json`
- **Relates to:** decision 0039 (plans and budgets), decision 0040 (runtime console), decision 0044 (support
  sessions), decision 0055 (grouped navigation), decision 0062 (tenant datasets), decision 0074

## Context

The review behind decision 0074 also found staff-side gaps: `platform.staff.manage` and
`platform.audit-log.read` existed with no endpoint or screen (staff were granted only by
`pnpm platform:grant-staff`), plans could not be deleted, and eval datasets could be neither renamed nor
deleted. It also found that devices have no screen in the app to type their activation code.

## Decision

1. **Staff management** (`/v1/admin/staff`, `platform.staff.manage`, platform admins only):
   - list every staff record, active and revoked; `PUT /{userId} { role }` grants or changes one of the
     two fixed roles; `DELETE /{userId}` sets `isActive: false`, ends the member's open support sessions
     and syncs claims;
   - the target must be an existing user (`users/{uid}`), else 404;
   - **nobody changes or revokes their own record** (`STAFF_SELF_CHANGE`, 422). The caller is an active
     admin, so the platform always keeps one; no separate "last admin" rule is needed;
   - audited `PLATFORM_STAFF_GRANTED` (with `changes` on a change) and the new `PLATFORM_STAFF_REVOKED`,
     with the calling staff as actor. The script keeps the `system` actor for bootstrapping;
   - the console area `/admin/team` finds the account by its exact email through the existing user search.
     Roles stay fixed: no editor of staff roles.
2. **Platform audit log**: `GET /v1/admin/audit-logs` (`platform.audit-log.read`, both staff roles),
   newest first, filtered by `action` and by `organizationId` (the entry's `targetTenantId`). Composite
   indexes on `platform-audit-logs` back those filters. The console area `/admin/audit` uses the same
   table as the organization audit page, moved to the `audit-log-table` widget.
3. **Plan deletion**: `DELETE /v1/admin/plans/{planId}` deletes only a plan no organization is on
   (`PLAN_IN_USE`, 409), so no budget loses its source; audited `PLAN_DELETED`.
4. **Dataset rename and delete**: `PATCH` and `DELETE /v1/evals/datasets/{datasetId}`
   (`core.eval.write`) through new runtime console routes, tenant-scoped like the items.
   - Deleting is refused once an experiment ran on the dataset (`DATASET_IN_USE`, 409): Mastra would keep
     the experiments with no dataset, and their results would lose their meaning.
   - The `feedback` dataset is never renamed or deleted, and no dataset takes its name
     (`DATASET_RESERVED`, 422): the runtime recreates it on the next rating.
   - The console gateway maps statuses only (decision 0040), so for these two routes 409 and 422 are
     translated to the new codes in the gateway.
5. **Device activation stays in the device's software** (decision 0008 §3): the redeem endpoint
   returns a token for a *device* principal, and the app shell is built for users (`/v1/me`). A kiosk
   mode in the app would need its own design; it is not added here.

## Alternatives rejected

- **Editable staff roles.** Two roles cover the console today; a role editor would need its own
  permission model and audit, with no request for it.
- **A "last platform admin" check instead of the self rule.** The self rule is simpler, also stops an
  admin from locking themselves out, and implies the other.
- **Cascade dataset deletion to its experiments.** It silently erases eval history.
- **Archive plans instead of deleting.** Nothing reads an archived plan; refusing plans in use covers
  the risk.

## Consequences

- A new installation still needs `pnpm platform:grant-staff` for its first admin.
- The platform audit indexes must be deployed with the code (`firebase deploy --only firestore:indexes`).
- `STAFF_SELF_CHANGE`, `PLAN_IN_USE`, `DATASET_IN_USE` and `DATASET_RESERVED` join the error catalog,
  with messages in the three locales.
