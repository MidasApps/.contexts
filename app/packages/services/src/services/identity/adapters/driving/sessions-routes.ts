import {
  createDesktopSessionEndpoint,
  exchangeDesktopSessionEndpoint,
  listSessionsEndpoint,
  revokeAllSessionsEndpoint,
  revokeSessionEndpoint,
} from "@core/contracts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { SessionNotFoundError } from "../../domain/errors/session-errors.ts";
import type { SessionServices } from "../../session-composition.ts";

const sessionErrorResponse = (error: AccessDeniedError | SessionNotFoundError, requestId: string): Response =>
  error instanceof AccessDeniedError ? deniedResponse(error.reason, requestId) : apiError(404, "NOT_FOUND", requestId);

/**
 * `/v1` session handlers (SP1 spec §7.3): `GET /me/sessions`, `DELETE /me/sessions/{sessionId}`,
 * `POST /me/sessions/revoke-all`, `POST /me/desktop-sessions`, `POST /desktop-sessions/exchange`.
 */
export const buildSessionsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  sessions: SessionServices;
}): Record<string, RouteHandler> => {
  const { pipeline, sessions } = deps;
  return {
    [listSessionsEndpoint.id]: withApiRoute(listSessionsEndpoint, pipeline, async ({ principal, input, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      return listResponse(await sessions.listSessions({ actor: principal, page }), page.limit);
    }),
    [revokeSessionEndpoint.id]: withApiRoute(
      revokeSessionEndpoint,
      pipeline,
      async ({ principal, input, requestId }) => {
        const result = await sessions.revokeSession({ actor: principal, sessionId: input.params.sessionId, requestId });
        return result.ok ? noContentResponse() : sessionErrorResponse(result.error, requestId);
      },
    ),
    [revokeAllSessionsEndpoint.id]: withApiRoute(
      revokeAllSessionsEndpoint,
      pipeline,
      async ({ principal, requestId }) => {
        const result = await sessions.revokeAllSessions({ actor: principal, requestId });
        return result.ok ? noContentResponse() : sessionErrorResponse(result.error, requestId);
      },
    ),
    [createDesktopSessionEndpoint.id]: withApiRoute(
      createDesktopSessionEndpoint,
      pipeline,
      async ({ principal, request, requestId }) => {
        const result = await sessions.createDesktopSession({
          actor: principal,
          userAgent: request.headers.get("user-agent"),
        });
        if (!result.ok) return sessionErrorResponse(result.error, requestId);
        return dataResponse(
          { data: result.data },
          { status: 201, location: `/v1/me/sessions/${result.data.sessionId}` },
        );
      },
    ),
    [exchangeDesktopSessionEndpoint.id]: withApiRoute(
      exchangeDesktopSessionEndpoint,
      pipeline,
      async ({ input, requestId, logger }) => {
        const result = await sessions.exchangeDesktopSession({ secret: input.body.secret, requestId });
        if (result.ok) return dataResponse({ data: result.data });
        logger.info("desktop_session_exchange_refused", { requestId, reason: result.error.reason });
        return apiError(401, "UNAUTHORIZED", requestId);
      },
    ),
  };
};
