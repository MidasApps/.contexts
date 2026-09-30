import { AGENT_PRINCIPAL_KEY } from "../context/agent-request-context.ts";
import type { AccessPrincipal } from "../runtime/runtime-ports.ts";

export const TEST_TENANT = "Jd8sK2lPq0WnR5tYu3bV";
export const TEST_UID = "member-uid";
export const TEST_REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";

export type AgentContextOverrides = {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly unitId?: string;
  readonly permissions?: readonly string[];
  readonly principalKind?: "user" | "service";
  readonly principal?: AccessPrincipal;
  readonly conversationId?: string;
};

/**
 * Request-context entries as the context middleware writes them (Task 7):
 * one key per `AgentRequestContext` field plus the verified principal.
 * Feed them to `new RequestContext(entries)` or a `Map`.
 */
export const buildAgentContextEntries = (overrides: AgentContextOverrides = {}): [string, unknown][] => {
  const tenantId = overrides.tenantId ?? TEST_TENANT;
  const principal: AccessPrincipal = overrides.principal ?? { type: "user", uid: TEST_UID, mfa: false };
  const context: Record<string, unknown> = {
    tenantId,
    ...(overrides.projectId === undefined ? {} : { projectId: overrides.projectId }),
    ...(overrides.unitId === undefined ? {} : { unitId: overrides.unitId }),
    userId: TEST_UID,
    principalKind: overrides.principalKind ?? "user",
    permissions: [...(overrides.permissions ?? ["core.chat.use"])],
    locale: "pt-BR",
    displayTimeZone: "America/Sao_Paulo",
    nodeTimeZone: "America/Sao_Paulo",
    currency: "BRL",
    requestId: TEST_REQUEST_ID,
    organizationId: tenantId,
    aiMode: "fake",
    ...(overrides.conversationId === undefined ? {} : { conversationId: overrides.conversationId }),
  };
  return [...Object.entries(context), [AGENT_PRINCIPAL_KEY, principal]];
};
