import { FORWARDED_HEADERS } from "@core/contracts";
import { resolveRequestId } from "@core/services";
import { type AgentMiddleware, apiPathPattern, normalizeApiPrefix } from "./agent-middleware.ts";

type RouteRule = { readonly methods: ReadonlySet<string> | "any"; readonly pattern: RegExp };

const READ = new Set(["GET", "HEAD"]);
const POST = new Set(["POST"]);
const DELETE = new Set(["DELETE"]);

/** Agent actions `/v1` uses through the gateway (spec §4.1); model changes, clones and direct tool runs stay closed. */
const AGENT_ACTIONS =
  "generate|stream|approve-tool-call|decline-tool-call|approve-tool-call-generate|decline-tool-call-generate|resume-stream";

/**
 * Built-in Mastra routes the core serves (spec §4.3), relative to the API prefix.
 * Everything else under the prefix answers 404, so a route added by a Mastra
 * upgrade stays closed until it is listed here. Closed on purpose: `/vectors`,
 * `/vector`, `/tools` (direct execution), `/v1/responses`, `/v1/conversations`,
 * `/stored/*`, memory writes, the REST tool execution of MCP servers, `/schedules` (a raw
 * schedule carries any request context; tenant schedules go through `/tenant-schedules`, SP5) and
 * every workflow but `knowledge-ingest` (SP5: runs go through `/workflow-runs`).
 */
const ALLOWED_ROUTES: readonly RouteRule[] = [
  { methods: READ, pattern: /^\/agents$/ },
  { methods: READ, pattern: /^\/agents\/[^/]+$/ },
  { methods: POST, pattern: new RegExp(`^/agents/[^/]+/(?:${AGENT_ACTIONS})$`) },
  { methods: READ, pattern: /^\/memory(?:\/[^/]+)*$/ },
  // The gateway deletes a conversation's thread (`deleteThread`).
  { methods: DELETE, pattern: /^\/memory\/threads\/[^/]+$/ },
  // Only the knowledge ingestion is launched by `/v1` with the caller's Bearer (SP3 Task 14). Every
  // other workflow is started, resumed and read through the custom routes (`/workflow-runs`,
  // `/workflow-approvals`, `/tenant-schedules`), which re-authorize; a raw run would skip that
  // (e.g. `usage-report` without `core.usage.read`).
  { methods: "any", pattern: /^\/workflows\/knowledge-ingest(?:\/[^/]+)*$/ },
  { methods: "any", pattern: /^\/mcp\/[^/]+\/(?:mcp|sse|messages)$/ },
  { methods: READ, pattern: /^\/mcp\/[^/]+\/(?:tools|resources)$/ },
  { methods: "any", pattern: /^\/observability(?:\/[^/]+)*$/ },
  { methods: "any", pattern: /^\/datasets(?:\/[^/]+)*$/ },
];

/**
 * Whether a built-in route is served.
 * @param path the path after the API prefix (`/agents/x/stream`).
 * @param hiddenAgentIds agents served only by custom routes (the durable chat wrappers, SP4):
 *   every `/agents/<id>` route of theirs answers 404.
 */
export const isAllowedRoute = (method: string, path: string, hiddenAgentIds: readonly string[] = []): boolean => {
  const upper = method.toUpperCase();
  const agentId = /^\/agents\/([^/]+)/.exec(path)?.[1];
  if (agentId !== undefined && hiddenAgentIds.includes(agentId)) return false;
  return ALLOWED_ROUTES.some((rule) => (rule.methods === "any" || rule.methods.has(upper)) && rule.pattern.test(path));
};

// The api.md §6 envelope, with the forwarded request id.
const notFound = (request: Request): Response =>
  Response.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
        requestId: resolveRequestId(request.headers.get(FORWARDED_HEADERS.requestId)),
      },
    },
    { status: 404 },
  );

/**
 * 404 for every built-in route outside `ALLOWED_ROUTES` (spec §4.3). Custom API
 * routes live outside the prefix (Mastra requires it) and are not affected.
 * @param options.apiPrefix Mastra `server.apiPrefix` (default `/api`).
 * @param options.hiddenAgentIds agents reachable only through the chat routes (`/chat/*`).
 */
export const createRouteAllowlistMiddleware = (options: {
  readonly apiPrefix?: string;
  readonly hiddenAgentIds?: readonly string[];
}): AgentMiddleware => {
  const prefix = normalizeApiPrefix(options.apiPrefix);
  return {
    path: apiPathPattern(prefix),
    handler: async (context, next) => {
      const { pathname } = new URL(context.req.raw.url);
      const relative = pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : undefined;
      if (relative === undefined || !isAllowedRoute(context.req.raw.method, relative, options.hiddenAgentIds))
        return notFound(context.req.raw);
      await next();
      return undefined;
    },
  };
};
