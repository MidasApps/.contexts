import { FORWARDED_HEADERS } from "@core/contracts";
import { getWebRequest, MastraAuthProvider, type MastraAuthRequest } from "@mastra/core/server";
import type { AccessContext, AccessPort, AccessPrincipal, NodeRef } from "../runtime/runtime-ports.ts";
import {
  type AgentPrincipal,
  buildAgentPrincipal,
  type ForwardedScope,
  nodeFromScope,
  principalIdentity,
  resourceIdOf,
} from "./agent-principal.ts";
import { readBearerToken, readForwardedHeader, readRequestPath, requiresRevocationCheck } from "./bearer-only.ts";

export type FirebaseMastraAuthOptions = {
  readonly access: AccessPort;
  /** Mastra `server.apiPrefix` (default `/api`); the MCP routes live under `<prefix>/mcp/`. */
  readonly apiPrefix?: string;
};

const CHAT_PERMISSION = "core.chat.use";
const MCP_PERMISSION = "core.mcp.use";
/** Mastra default `server.apiPrefix`. */
export const DEFAULT_MASTRA_API_PREFIX = "/api";

const readScope = (request: MastraAuthRequest): ForwardedScope => {
  const pick = (name: string) => readForwardedHeader(request, name);
  const entries = {
    tenantId: pick(FORWARDED_HEADERS.tenantId),
    projectId: pick(FORWARDED_HEADERS.projectId),
    unitId: pick(FORWARDED_HEADERS.unitId),
    activeScreen: pick(FORWARDED_HEADERS.activeScreen),
  };
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
};

const mcpPathPrefix = (apiPrefix: string): string => `${apiPrefix.replace(/\/+$/, "")}/mcp/`;

/**
 * Permission a route needs: `core.mcp.use` on the MCP server, `core.chat.use` elsewhere.
 * @param apiPrefix the Mastra `server.apiPrefix` the routes are served under.
 */
export const requiredPermissionFor = (
  path: string | undefined,
  apiPrefix: string = DEFAULT_MASTRA_API_PREFIX,
): string => (path?.startsWith(mcpPathPrefix(apiPrefix)) === true ? MCP_PERMISSION : CHAT_PERMISSION);

/** An API key acts only in its own tenant; any other forwarded tenant names no node (fail-closed). */
const nodeForPrincipal = (principal: AccessPrincipal, scope: ForwardedScope): NodeRef | null => {
  if (principal.type === "service" && scope.tenantId !== principal.tenantId) return null;
  return nodeFromScope(scope);
};

/**
 * Caps an API key at its scopes (SP1 applies them in `getEffectivePermissions`),
 * even if the access context lists the owner's grants: effective = context ∩ key.
 */
const limitToKeyScopes = async (access: AccessPort, context: AccessContext, node: NodeRef): Promise<AccessContext> => {
  if (context.principal.type !== "service") return context;
  const keyPermissions = await access.getEffectivePermissions({ principal: context.principal, node });
  return { ...context, permissions: context.permissions.filter((permission) => keyPermissions.has(permission)) };
};

/**
 * Mastra auth provider backed by SP1 (spec §4.2, decision 0020). Mastra requires
 * subclassing `MastraAuthProvider`, hence a class. Gotchas handled (SP0 §1):
 * `mapUserToResourceId` goes through `super()` (a subclass method would be
 * shadowed); only `Authorization: Bearer` counts (never `?apiKey=`);
 * `checkRevoked` on every non-read method.
 */
export class FirebaseMastraAuth extends MastraAuthProvider<AgentPrincipal> {
  readonly #access: AccessPort;
  readonly #apiPrefix: string;
  // One verification per HTTP request: the context middleware and Mastra's route
  // auth both authenticate it. Keyed by the raw Request, so nothing outlives it.
  readonly #perRequest = new WeakMap<
    Request,
    { readonly token: string; readonly result: Promise<AgentPrincipal | null> }
  >();

  constructor(options: FirebaseMastraAuthOptions) {
    super({ name: "firebase", mapUserToResourceId: resourceIdOf });
    this.#access = options.access;
    this.#apiPrefix = options.apiPrefix ?? DEFAULT_MASTRA_API_PREFIX;
  }

  /** @returns `null` (401) unless the header carries this exact Bearer token and SP1 verifies it. */
  authenticateToken(token: string, request: MastraAuthRequest): Promise<AgentPrincipal | null> {
    const raw = getWebRequest(request);
    const cached = raw === undefined ? undefined : this.#perRequest.get(raw);
    if (cached?.token === token) return cached.result;
    const result = this.#authenticate(token, request);
    if (raw !== undefined) this.#perRequest.set(raw, { token, result });
    return result;
  }

  async #authenticate(token: string, request: MastraAuthRequest): Promise<AgentPrincipal | null> {
    const bearer = readBearerToken(request);
    if (bearer === undefined || bearer !== token) return null;
    const principal = await this.#access.verifyBearer({ token, checkRevoked: requiresRevocationCheck(request) });
    if (principal === null) return null;
    const identity = principalIdentity(principal);
    if (identity === null) return null;
    const scope = readScope(request);
    const node = nodeForPrincipal(principal, scope);
    const context = node === null ? null : await this.#resolveContext(principal, node);
    return buildAgentPrincipal({ principal, identity, scope, context });
  }

  async #resolveContext(principal: AccessPrincipal, node: NodeRef): Promise<AccessContext | null> {
    const context = await this.#access.resolveAccessContext({ principal, node });
    return context === null ? null : limitToKeyScopes(this.#access, context, node);
  }

  /** @returns `false` (403) without membership or without the route's permission. */
  authorizeUser(user: AgentPrincipal, request: MastraAuthRequest): boolean {
    return user.isMember && user.permissions.has(requiredPermissionFor(readRequestPath(request), this.#apiPrefix));
  }
}
