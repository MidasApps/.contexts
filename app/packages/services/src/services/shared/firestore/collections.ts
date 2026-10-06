/**
 * Top-level collections of the core (SP1 spec §4). Adapters of several contexts read
 * the same collection (the access node-chain reader reads tenancy's nodes), so the
 * names live here once.
 */
export const CORE_COLLECTIONS = {
  users: "users",
  platformStaff: "platform-staff",
  organizations: "organizations",
  projects: "projects",
  units: "units",
  unitTreeLocks: "unit-tree-locks",
  roles: "roles",
  memberships: "memberships",
  access: "access",
  invitations: "invitations",
  devices: "devices",
  deviceActivations: "device-activations",
  apiKeys: "api-keys",
  impersonationSessions: "impersonation-sessions",
  approvalRequests: "approval-requests",
  sessions: "sessions",
} as const;

/** Stored shape version of every core entity (contracts/firebase-firestore.md §17). */
export const CORE_SCHEMA_VERSION = 1;
