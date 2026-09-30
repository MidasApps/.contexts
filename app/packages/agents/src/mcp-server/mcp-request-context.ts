import type { IncomingMessage } from "node:http";
import { AgentRequestContextSchema, PrincipalSchema } from "@core/contracts";
import { type AgentContextSnapshot, readAgentContext, type RequestContextReader } from "../context/agent-request-context.ts";
import { type RequestContextStore, writeAgentContext } from "../context/write-agent-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";

/**
 * Bridge of the typed agent context into MCP requests (SP3 Task 24, decision 0027).
 * `MCPServer` builds a fresh `RequestContext` per MCP request that holds only `authInfo`,
 * `user` and `traceContext`; the context middleware's keys never reach its tools or the
 * `ask_<agent>` runs. So:
 * 1. `server.mcpOptions.setRequestAuth` copies the verified snapshot of the Mastra request
 *    context into `req.auth.extra` (server-side only: the transport never reads it from the
 *    client);
 * 2. the server's `mapAuthInfoToUser` writes it back into the MCP request context with
 *    `writeAgentContext` (tenant, principal, resource and thread keys).
 * Without a verified snapshot nothing is written and every core tool fails closed
 * (`CONTEXT_MISSING`).
 */

/** Key of the snapshot inside `authInfo.extra`. */
export const MCP_AGENT_CONTEXT_KEY = "coreAgentContext";

/** What `@modelcontextprotocol` reads from `req.auth` (Mastra's `McpAuthInfo`). */
type McpAuthInfo = { token: string; clientId: string; scopes: string[]; extra?: Record<string, unknown> };

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * `server.mcpOptions.setRequestAuth` of `new Mastra()`: runs after the context middleware
 * and Mastra's route auth, on the Node request handed to the MCP transport.
 */
export const setMcpRequestAuth = (req: IncomingMessage & { auth?: McpAuthInfo }, requestContext: RequestContextReader): void => {
  const read = readAgentContext(requestContext);
  const header: unknown = req.headers.authorization;
  const token = BEARER.exec(typeof header === "string" ? header : "")?.[1];
  if (!read.ok || token === undefined) return;
  const { context, principal } = read.data;
  req.auth = { token, clientId: context.userId, scopes: [...context.permissions], extra: { [MCP_AGENT_CONTEXT_KEY]: { context, principal } } };
};

const snapshotOf = (extra: Record<string, unknown> | undefined): AgentContextSnapshot | null => {
  const raw = extra?.[MCP_AGENT_CONTEXT_KEY];
  if (typeof raw !== "object" || raw === null) return null;
  const context = AgentRequestContextSchema.safeParse((raw as { context?: unknown }).context);
  const principal = PrincipalSchema.safeParse((raw as { principal?: unknown }).principal);
  if (!context.success || !principal.success) return null;
  // The contract schema is the SP1 principal; the port type mirrors it without brands.
  return { context: context.data, principal: principal.data as AccessPrincipal };
};

/**
 * `MCPServer({ mapAuthInfoToUser })`: restores the snapshot into the MCP request context and
 * answers the user (the caller's uid) that request-state continuations are bound to.
 * @returns `null` (no user, nothing written) for an unverified or malformed snapshot.
 */
export const hydrateMcpRequestContext = (args: { readonly authInfo: unknown; readonly requestContext: RequestContextStore }): { readonly id: string } | null => {
  const extra = typeof args.authInfo === "object" && args.authInfo !== null ? (args.authInfo as { extra?: unknown }).extra : undefined;
  const snapshot = snapshotOf(typeof extra === "object" && extra !== null ? (extra as Record<string, unknown>) : undefined);
  if (snapshot === null) return null;
  writeAgentContext(args.requestContext, snapshot);
  return readAgentContext(args.requestContext).ok ? { id: snapshot.context.userId } : null;
};
