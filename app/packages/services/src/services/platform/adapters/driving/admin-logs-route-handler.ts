import { adminListLogsEndpoint } from "@core/contracts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { LogRecord } from "../../../shared/observability/logger.ts";
import { listLogLines } from "../../application/use-cases/list-log-lines.ts";
import { requireStaff } from "./console-guards.ts";

export const LOGS_PERMISSION = "platform.trace.read";

export type AdminLogsRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  /** Logical environment (`APP_ENV`): the endpoint exists in `local` only. */
  readonly appEnv: string;
  /** The process ring, oldest first; `null` when the process keeps none. */
  readonly readLogs: () => readonly LogRecord[] | null;
};

/**
 * `GET /v1/admin/logs` (SP5 spec §6, decision 0043): the last structured log lines of this
 * process from the in-memory ring, for staff with `platform.trace.read`. Local only: every other
 * environment answers 404 (the console links to Cloud Logging there). Staff is checked first, so
 * a non-staff caller learns nothing about the environment.
 */
export const buildAdminLogsRoutes = (deps: AdminLogsRouteDeps): Record<string, RouteHandler> => ({
  [adminListLogsEndpoint.id]: withApiRoute(adminListLogsEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: LOGS_PERMISSION });
    if (denied !== null) return denied;
    const records = deps.appEnv === "local" ? deps.readLogs() : null;
    if (records === null) return apiError(404, "NOT_FOUND", ctx.requestId);
    return dataResponse({ data: listLogLines(records, ctx.input.query) });
  }),
});
