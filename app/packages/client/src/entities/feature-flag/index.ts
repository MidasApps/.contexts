// Public API of the feature-flag entity (SP5 Task 13): registry flags as platform staff see them.
export { adminFlagsQuery, featureFlagKeys, useAdminFlags } from "./api/feature-flag-queries.ts";
// SP5 Task 14: the flags an organization may override (`/settings/flags`).
export { tenantFlagKeys, tenantFlagsQuery, useTenantFlags } from "./api/tenant-flag-queries.ts";
