import {
  createCustomAgentEndpoint,
  deleteCustomAgentEndpoint,
  getCustomAgentEndpoint,
  getCustomAgentOptionsEndpoint,
  listChatAgentsEndpoint,
  type Principal,
  type TenantId,
  updateCustomAgentEndpoint,
} from "@core/contracts";
import { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { Logger } from "../../../shared/observability/logger.ts";
import { runtimeCallScope, tenantOfCall, workflowCallScope, workflowGatewayErrorResponse } from "../../../workflows/adapters/driving/workflow-call-scope.ts";
import type { WorkflowRuntimeGateway } from "../../../workflows/application/ports/workflow-runtime-gateway.ts";
import { CUSTOM_AGENTS_READ_PERMISSION } from "../../application/custom-agents-deps.ts";
import type { CustomAgentsServices } from "../../composition.ts";
import {
  CustomAgentNotFoundError,
  CustomLimitReachedError,
  CustomSkillNameTakenError,
  CustomSkillNotFoundError,
  InvalidCustomDefinitionError,
} from "../../domain/custom-agent-errors.ts";

/** How long a write waits for the runtime to drop its cache; the cache expires by itself after 60 s. */
export const INVALIDATE_TIMEOUT_MS = 3000;

export type CustomAgentsRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly customAgents: CustomAgentsServices;
  readonly gateway: Pick<WorkflowRuntimeGateway, "getCustomAgentOptions" | "invalidateCustomAgents">;
  readonly resolveAccessContext: ResolveAccessContext;
};

/** @throws the error when it is not an expected custom agents error (the boundary answers 500). */
export const customAgentErrorResponse = (error: Error, requestId: string): Response => {
  if (error instanceof AccessDeniedError) return deniedResponse(error.reason, requestId);
  if (error instanceof CustomAgentNotFoundError || error instanceof CustomSkillNotFoundError) return apiError(404, "NOT_FOUND", requestId);
  if (error instanceof InvalidCustomDefinitionError) return apiError(400, "VALIDATION_FAILED", requestId, [...error.details]);
  if (error instanceof CustomSkillNameTakenError) return apiError(409, "CONFLICT", requestId, [{ field: "name", issue: "TAKEN" }]);
  if (error instanceof CustomLimitReachedError) return apiError(422, "CUSTOM_LIMIT_REACHED", requestId, [{ field: error.kind, issue: "LIMIT_REACHED" }]);
  throw error;
};

type InvalidateCtx = { readonly principal: Principal; readonly requestId: string; readonly request: Request; readonly logger: Pick<Logger, "warn"> };

/**
 * Asks the runtime to drop the tenant's cached custom agents after a write (decision 0046 §14).
 * Best effort: a failure is logged and the write stands; the runtime cache expires on its own.
 */
export const invalidateRuntimeCache = async (deps: Pick<CustomAgentsRouteDeps, "gateway" | "resolveAccessContext">, ctx: InvalidateCtx, tenantId: TenantId): Promise<void> => {
  try {
    const scope = await runtimeCallScope({ ctx, tenantId, resolveAccessContext: deps.resolveAccessContext });
    if (scope === null) return;
    const result = await deps.gateway.invalidateCustomAgents({ ...scope, signal: AbortSignal.timeout(INVALIDATE_TIMEOUT_MS) });
    if (!result.ok) ctx.logger.warn("custom_agents_invalidate_failed", { requestId: ctx.requestId, tenantId, code: result.error.code });
  } catch (error: unknown) {
    ctx.logger.warn("custom_agents_invalidate_failed", { requestId: ctx.requestId, tenantId, err: error });
  }
};

const agentPath = (agentId: string, tenantId: string) => `/v1/agents/${agentId}?organizationId=${tenantId}`;

const buildAgentWriteRoutes = (deps: CustomAgentsRouteDeps): Record<string, RouteHandler> => {
  const { pipeline, customAgents } = deps;
  return {
    [createCustomAgentEndpoint.id]: withApiRoute(createCustomAgentEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.createCustomAgent({ actor: ctx.principal, access: ctx.scope, tenantId, requestId: ctx.requestId, input: ctx.input.body });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return dataResponse({ data: result.data }, { status: 201, location: agentPath(result.data.id, tenantId) });
    }),
    [updateCustomAgentEndpoint.id]: withApiRoute(updateCustomAgentEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.updateCustomAgent({ actor: ctx.principal, access: ctx.scope, tenantId, requestId: ctx.requestId, agentId: ctx.input.params.agentId, input: ctx.input.body });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return dataResponse({ data: result.data });
    }),
    [deleteCustomAgentEndpoint.id]: withApiRoute(deleteCustomAgentEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.deleteCustomAgent({ actor: ctx.principal, access: ctx.scope, tenantId, requestId: ctx.requestId, agentId: ctx.input.params.agentId });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return noContentResponse();
    }),
  };
};

const buildAgentReadRoutes = (deps: CustomAgentsRouteDeps): Record<string, RouteHandler> => {
  const { pipeline, customAgents } = deps;
  return {
    [getCustomAgentEndpoint.id]: withApiRoute(getCustomAgentEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.getCustomAgent({ actor: ctx.principal, access: ctx.scope, tenantId, agentId: ctx.input.params.agentId });
      return result.ok ? dataResponse({ data: result.data }) : customAgentErrorResponse(result.error, ctx.requestId);
    }),
    // The runtime knows the tools and skills, the plan the limits: both must answer.
    [getCustomAgentOptionsEndpoint.id]: withApiRoute(getCustomAgentOptionsEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const scope = await workflowCallScope({ ctx, organizationId: tenantId, permission: CUSTOM_AGENTS_READ_PERMISSION, resolveAccessContext: deps.resolveAccessContext });
      if (scope instanceof Response) return scope;
      const usage = await customAgents.getCustomAgentUsage({ actor: ctx.principal, access: ctx.scope, tenantId });
      if (!usage.ok) return customAgentErrorResponse(usage.error, ctx.requestId);
      const options = await deps.gateway.getCustomAgentOptions(scope);
      return options.ok ? dataResponse({ data: { ...options.data, ...usage.data } }) : workflowGatewayErrorResponse(options.error, ctx.requestId);
    }),
    [listChatAgentsEndpoint.id]: withApiRoute(listChatAgentsEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.listChatAgents({ actor: ctx.principal, access: ctx.scope, tenantId });
      return result.ok ? dataResponse({ data: result.data }) : customAgentErrorResponse(result.error, ctx.requestId);
    }),
  };
};

/**
 * `/v1` handlers of tenant-defined agents (decision 0046): create, read, change and delete one,
 * the options of the forms and the agents a member can chat with. The organization comes from
 * `?organizationId=` (an API key acts in its own). Reads need `core.agent-settings.read`,
 * writes `core.agent-settings.update`, the chat list `core.chat.use`.
 */
export const buildCustomAgentsRoutes = (deps: CustomAgentsRouteDeps): Record<string, RouteHandler> => ({
  ...buildAgentWriteRoutes(deps),
  ...buildAgentReadRoutes(deps),
});
