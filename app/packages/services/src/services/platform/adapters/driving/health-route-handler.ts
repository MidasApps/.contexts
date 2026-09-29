import { withRouteBoundary, type RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { Logger } from "../../../shared/observability/logger.ts";
import { processLogger } from "../../../shared/observability/process-logger.ts";

/**
 * Liveness only: answers while the process can serve requests. It checks no
 * dependency and exposes no version or config (rules/observability.md, Health
 * checks), so it needs no auth. Readiness is a separate endpoint when needed.
 * @see app/docs/decisions/0003-public-liveness-endpoint.md (why it is public
 *   and what it may never return)
 */
export const makeHealthRouteHandler = (deps: { logger: Logger }): RouteHandler =>
  withRouteBoundary({ operation: "health_checked", logger: deps.logger }, () =>
    Promise.resolve(
      Response.json({ data: { status: "ok" } }, { status: 200, headers: { "cache-control": "no-store" } }),
    ),
  );

/** `GET /v1/health`; web `src/app/v1/health/route.ts` re-exports it. */
export const GET: RouteHandler = makeHealthRouteHandler({ logger: processLogger });
