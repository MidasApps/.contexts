import { type ApiRouteDeps, deniedResponse, invalidCursorResponse, listResponse, pageRequestOf, type RouteHandler, withApiRoute } from "@core/services";
import { listNotesEndpoint } from "../contracts/note-endpoints.ts";
import { createExampleNotes, type ExampleServerDeps } from "./example-commands.ts";

/**
 * `/v1` handlers of the module (follow-up #38), keyed by the ids of `EXAMPLE_ENDPOINTS`; the web
 * app adds them next to the core routes (`apps/web/src/server/runtime-routes.ts`). Each runs in
 * the core pipeline (`withApiRoute`: authentication, rate limit, validation, one log line).
 */
export const createExampleRoutes = (deps: ExampleServerDeps & { readonly pipeline: ApiRouteDeps }): Record<string, RouteHandler> => {
  const notes = createExampleNotes(deps);
  return {
    [listNotesEndpoint.id]: withApiRoute(listNotesEndpoint, deps.pipeline, async ({ principal, input, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const result = await notes.listNotes({ actor: principal, tenantId: input.params.organizationId, page });
      // A caller without a grant in the organization gets 404, one without the permission 403.
      return result.ok ? listResponse(result.data, page.limit) : deniedResponse(result.error.reason, requestId);
    }),
  };
};
