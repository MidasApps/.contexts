# 0066. A tenant removes its own flag override; the overview measures the tripwire rate

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/contracts` (`platform/flag-endpoints.ts`), `app/packages/services` (`flags`), `app/apps/web` (`src/app/v1/flags/[flagKey]/route.ts`), `app/packages/client` (`features/tenant-set-flag`, `views/settings-flags`), `app/packages/i18n` (`settings.flags`) (local decision; the framework is unchanged)
- **Refines:** decisions 0039 (feature flags), 0044 (staff removal of an override); follow-up #56

## Context

Follow-up #56: staff can remove an organization's override of a flag
(`DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}`, decision 0044), but the
organization itself can only set a value (`PUT /v1/flags/{flagKey}`). An organization that switched
a flag off could only switch it back on with an override `true`. It could not return to following
the environment value.

## Decision

1. **Endpoint.** `DELETE /v1/flags/{flagKey}?organizationId=` (`flags.clearTenantOverride`) needs
   the same permission as the write: `core.flag.write` at the organization (`requireTenant`). It
   answers the flag without the override (200, `FeatureFlag`). It is idempotent: removing an
   absent override answers the flag again and writes no audit entry.
2. **Who removes what.** `ClearFlagOverrideCommand` gains `by: "staff" | "tenant"`, as
   `SetFlagValueCommand` has. A tenant may remove its override only on a tenant-overridable flag.
   Otherwise the answer is 403 `FORBIDDEN` (`FLAG_NOT_OVERRIDABLE`), so an organization never
   removes what staff set on a flag it cannot change. An unknown flag is 404.
3. **Audit.** A removal is audited like a write (`FEATURE_FLAG_UPDATED`,
   `changes: ["tenantOverride"]`). Staff removals go to the platform log with `targetTenantId`, as
   before. A tenant removal goes to the organization's log.
4. **`/settings/flags`.** A row with an override shows "Seguir a plataforma" next to the existing
   action. It is shown only to a member with `core.flag.write`, and only while online. It opens a
   confirmation dialog (`TenantClearFlagOverrideDialog`) that says the feature will take the
   platform value, on or off. The dialog shows the pending state, keeps a failure in the dialog
   with the request reference, and refreshes the list on success. This is the same pattern as
   `TenantSetFlagDialog`. "Voltar a usar" still writes an override `true`.

## Consequences

- An organization can now undo its own change completely; the list then shows "Sem alteração" and
  the platform value again.
- `ClearFlagOverride` callers must say who acts (`by`); the staff route passes `"staff"`.

## Alternatives rejected

- **`PUT /v1/flags/{flagKey}` with `value: null`.** The body would mix two operations and break
  the existing `TenantFlagValueInput` contract.
- **Making "Voltar a usar" remove the override.** This would change what an existing action does
  without saying so. The follow-up asks for a removal, so the removal is a separate, named action.
