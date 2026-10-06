import { CORE_ENDPOINTS } from "@core/contracts";
import { buildApprovalsRoutes } from "./access/adapters/driving/approvals-routes.ts";
import { buildInvitationsRoutes } from "./access/adapters/driving/invitations-routes.ts";
import { buildMembersRoutes } from "./access/adapters/driving/members-routes.ts";
import { buildMembershipsRoutes } from "./access/adapters/driving/memberships-routes.ts";
import { buildRolesRoutes } from "./access/adapters/driving/roles-routes.ts";
import type { ApprovalServices } from "./access/approval-composition.ts";
import type { AccessServices } from "./access/composition.ts";
import type { MemberServices } from "./access/member-composition.ts";
import { buildAuditLogsRoutes } from "./audit/adapters/driving/audit-logs-routes.ts";
import type { AuditLogServices } from "./audit/composition.ts";
import { buildApiKeysRoutes } from "./identity/adapters/driving/api-keys-routes.ts";
import { buildDevicesRoutes } from "./identity/adapters/driving/devices-routes.ts";
import { buildMeRoutes } from "./identity/adapters/driving/me-routes.ts";
import { buildPlatformRoutes } from "./identity/adapters/driving/platform-routes.ts";
import { buildSessionsRoutes } from "./identity/adapters/driving/sessions-routes.ts";
import type { ApiKeyServices } from "./identity/api-key-composition.ts";
import type { IdentityServices } from "./identity/composition.ts";
import type { DeviceServices } from "./identity/device-composition.ts";
import type { PlatformServices } from "./identity/platform-composition.ts";
import type { SessionServices } from "./identity/session-composition.ts";
import type { ApiRouteDeps } from "./shared/http/api-route.ts";
import { errorResponse } from "./shared/http/error-envelope.ts";
import type { RouteHandler } from "./shared/http/route-boundary.ts";
import type { Logger } from "./shared/observability/logger.ts";
import { REQUEST_ID_HEADER, resolveRequestId } from "./shared/observability/request-id.ts";
import { buildOrganizationsRoutes } from "./tenancy/adapters/driving/organizations-routes.ts";
import { buildProjectsRoutes } from "./tenancy/adapters/driving/projects-routes.ts";
import { buildUnitTypesRoutes } from "./tenancy/adapters/driving/unit-types-routes.ts";
import { buildUnitsRoutes } from "./tenancy/adapters/driving/units-routes.ts";
import type { TenancyServices } from "./tenancy/composition.ts";

/** Route handlers keyed by endpoint id (`identity.getMe`), as declared in `CORE_ENDPOINTS`. */
export type CoreRoutes = Readonly<Record<string, RouteHandler>>;

/** What the verticals of the route table need. */
export type CoreRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly access: AccessServices;
  readonly members: MemberServices;
  readonly tenancy: TenancyServices;
  readonly identity: IdentityServices;
  readonly sessions: SessionServices;
  readonly apiKeys: ApiKeyServices;
  readonly devices: DeviceServices;
  readonly platform: PlatformServices;
  readonly approvals: ApprovalServices;
  readonly auditLogs: AuditLogServices;
};

/**
 * The `/v1` route table. Each vertical (SP1 Tasks 9–18) adds its handlers here with
 * `withApiRoute(<endpoint>, deps.pipeline, <handler>)`; the web app's `route(endpointId)`
 * looks them up.
 */
export const buildCoreRoutes = (deps: CoreRouteDeps): CoreRoutes => ({
  ...buildRolesRoutes(deps),
  ...buildMembersRoutes(deps),
  ...buildMembershipsRoutes(deps),
  ...buildInvitationsRoutes(deps),
  ...buildMeRoutes(deps),
  ...buildSessionsRoutes(deps),
  ...buildApiKeysRoutes(deps),
  ...buildDevicesRoutes(deps),
  ...buildPlatformRoutes(deps),
  ...buildApprovalsRoutes(deps),
  ...buildAuditLogsRoutes(deps),
  ...buildOrganizationsRoutes(deps),
  ...buildProjectsRoutes(deps),
  ...buildUnitsRoutes(deps),
  ...buildUnitTypesRoutes(deps),
});

/** Bug: a route file names an endpoint id that no descriptor declares. */
export class UnknownEndpointError extends Error {
  readonly code = "UNKNOWN_ENDPOINT";
  readonly endpointId: string;

  constructor(endpointId: string) {
    super(`UNKNOWN_ENDPOINT: ${endpointId}`);
    this.name = "UnknownEndpointError";
    this.endpointId = endpointId;
  }
}

const KNOWN_ENDPOINT_IDS: ReadonlySet<string> = new Set(CORE_ENDPOINTS.map((endpoint) => endpoint.id));

/**
 * Builds the web app's `route(endpointId)`: checks the id when the route module loads
 * (a typo fails `next build`), and resolves the handler lazily on the first request, so
 * building needs no runtime env. A declared endpoint without a handler yet answers the
 * canonical 500 envelope and logs `route_not_registered`.
 * @param endpointIds ids accepted besides the core descriptors (module endpoints).
 * @throws {UnknownEndpointError} at module load for an undeclared id.
 * @example export const GET = route("identity.getMe");
 */
export const createRouteResolver = (args: {
  getRoutes: () => CoreRoutes | Promise<CoreRoutes>;
  logger: Logger;
  endpointIds?: readonly string[];
}): ((endpointId: string) => RouteHandler) => {
  const known = new Set([...KNOWN_ENDPOINT_IDS, ...(args.endpointIds ?? [])]);
  return (endpointId) => {
    if (!known.has(endpointId)) throw new UnknownEndpointError(endpointId);
    return async (request) => {
      // Read the request before building the server: with Cache Components, Next
      // prerenders a GET route at build unless it touches request data first, and
      // building the server needs the runtime env.
      const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
      const handler = (await args.getRoutes())[endpointId];
      if (handler !== undefined) return handler(request);
      args.logger.error("route_not_registered", { requestId, endpointId });
      return errorResponse({ status: 500, code: "INTERNAL_ERROR", message: "Internal error.", requestId });
    };
  };
};
