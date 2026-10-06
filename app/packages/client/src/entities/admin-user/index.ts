// Public API of the admin-user entity (SP5 admin gaps, decision 0044): users as platform staff find and name them.
export {
  ADMIN_USERS_PAGE_LIMIT,
  type AdminUserSearch,
  adminUserKeys,
  adminUserSearchQuery,
  adminUsersByIdQuery,
  distinctSortedIds,
  useAdminUserNames,
  useAdminUserSearch,
} from "./api/admin-user-queries.ts";
export { adminUserLabel } from "./lib/admin-user-label.ts";
export { AdminUserRef } from "./ui/AdminUserRef.tsx";
export { AdminUserStatusPill } from "./ui/AdminUserStatusPill.tsx";
