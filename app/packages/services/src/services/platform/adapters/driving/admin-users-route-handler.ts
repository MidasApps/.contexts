import { ADMIN_USER_LOOKUP_MAX, adminListUsersEndpoint } from "@core/contracts";
import { apiError } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { AdminUserDirectory } from "../../application/ports/admin-user-directory.ts";
import { makeFindAdminUsers } from "../../application/use-cases/find-admin-users.ts";
import { requireStaff } from "./console-guards.ts";

/** `platform.*` permission of the staff user search and lookup (SP5 spec §2.1). */
export const USERS_PERMISSION = "platform.user.read";

export type AdminUsersRouteDeps = { readonly pipeline: ApiRouteDeps; readonly users: AdminUserDirectory };

const invalid = (requestId: string, field: string, issue: string): Response => apiError(400, "VALIDATION_FAILED", requestId, [{ field, issue }]);

// Distinct ids in the order asked; a document id never holds a slash.
const idsOf = (list: string): string[] => [
  ...new Set(
    list
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== "" && !id.includes("/")),
  ),
];

/**
 * `GET /v1/admin/users` (decision 0044): staff with MFA and `platform.user.read` search users by
 * name, email or id (`query`, cursor paged) or look many ids up at once (`ids`, one read). The text
 * is personal data: it is never logged and never echoed in an error.
 */
export const buildAdminUsersRoutes = (deps: AdminUsersRouteDeps): Record<string, RouteHandler> => {
  const findUsers = makeFindAdminUsers(deps);
  return {
    [adminListUsersEndpoint.id]: withApiRoute(adminListUsersEndpoint, deps.pipeline, async (ctx) => {
      const denied = await requireStaff(ctx, { permission: USERS_PERMISSION });
      if (denied !== null) return denied;
      const { query, by, ids, limit } = ctx.input.query;
      if (ids !== undefined) {
        if (query !== undefined) return invalid(ctx.requestId, "ids", "NOT_WITH_QUERY");
        const wanted = idsOf(ids);
        if (wanted.length > ADMIN_USER_LOOKUP_MAX) return invalid(ctx.requestId, "ids", "TOO_MANY");
        return listResponse({ items: wanted.length === 0 ? [] : await deps.users.getMany(wanted), nextCursor: null }, limit);
      }
      if (query === undefined) return invalid(ctx.requestId, "query", "REQUIRED");
      const page = pageRequestOf(ctx.input.query);
      if (page === null) return invalidCursorResponse(ctx.requestId);
      return listResponse(await findUsers({ query, by, page }), page.limit);
    }),
  };
};
