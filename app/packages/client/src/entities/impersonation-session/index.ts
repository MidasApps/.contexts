// Public API of the impersonation-session entity (SP5 admin gaps, decision 0044): support access sessions as staff list them.
export {
  adminImpersonationSessionsQuery,
  IMPERSONATION_SESSIONS_PAGE_LIMIT,
  impersonationSessionKeys,
  useAdminImpersonationSessions,
  type ImpersonationSessionScope,
} from "./api/impersonation-session-queries.ts";
