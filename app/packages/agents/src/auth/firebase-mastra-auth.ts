import { FORWARDED_HEADERS } from "@core/contracts";
import { MastraAuthProvider, type MastraAuthRequest } from "@mastra/core/server";
import type { AccessPort } from "../runtime/runtime-ports.ts";
import { type AgentPrincipal, buildAgentPrincipal, type ForwardedScope, nodeFromScope, principalIdentity, resourceIdOf } from "./agent-principal.ts";
import { readBearerToken, readForwardedHeader, readRequestPath, requiresRevocationCheck } from "./bearer-only.ts";

export type FirebaseMastraAuthOptions = { readonly access: AccessPort };

const CHAT_PERMISSION = "core.chat.use";
const MCP_PERMISSION = "core.mcp.use";
const MCP_PATH_PREFIX = "/api/mcp/";

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

/** Permission a route needs: `core.mcp.use` on the MCP server, `core.chat.use` elsewhere. */
export const requiredPermissionFor = (path: string | undefined): string =>
  path?.startsWith(MCP_PATH_PREFIX) === true ? MCP_PERMISSION : CHAT_PERMISSION;

/**
 * Mastra auth provider backed by SP1 (spec §4.2, decision 0020). Mastra requires
 * subclassing `MastraAuthProvider`, hence a class. Gotchas handled (SP0 §1):
 * `mapUserToResourceId` goes through `super()` (a subclass method would be
 * shadowed); only `Authorization: Bearer` counts (never `?apiKey=`);
 * `checkRevoked` on every non-read method.
 */
export class FirebaseMastraAuth extends MastraAuthProvider<AgentPrincipal> {
  readonly #access: AccessPort;

  constructor(options: FirebaseMastraAuthOptions) {
    super({ name: "firebase", mapUserToResourceId: resourceIdOf });
    this.#access = options.access;
  }

  /** @returns `null` (401) unless the header carries this exact Bearer token and SP1 verifies it. */
  async authenticateToken(token: string, request: MastraAuthRequest): Promise<AgentPrincipal | null> {
    const bearer = readBearerToken(request);
    if (bearer === undefined || bearer !== token) return null;
    const principal = await this.#access.verifyBearer({ token, checkRevoked: requiresRevocationCheck(request) });
    if (principal === null) return null;
    const identity = principalIdentity(principal);
    if (identity === null) return null;
    const scope = readScope(request);
    const node = nodeFromScope(scope);
    const context = node === null ? null : await this.#access.resolveAccessContext({ principal, node });
    return buildAgentPrincipal({ principal, identity, scope, context });
  }

  /** @returns `false` (403) without membership or without the route's permission. */
  authorizeUser(user: AgentPrincipal, request: MastraAuthRequest): boolean {
    return user.isMember && user.permissions.has(requiredPermissionFor(readRequestPath(request)));
  }
}
