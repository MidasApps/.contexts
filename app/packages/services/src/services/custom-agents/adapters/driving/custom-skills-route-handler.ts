import {
  createCustomSkillEndpoint,
  deleteCustomSkillEndpoint,
  getCustomSkillEndpoint,
  listCustomSkillsEndpoint,
  updateCustomSkillEndpoint,
} from "@core/contracts";
import { dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import { tenantOfCall } from "../../../workflows/adapters/driving/workflow-call-scope.ts";
import {
  type CustomAgentsRouteDeps,
  customAgentErrorResponse,
  invalidateRuntimeCache,
} from "./custom-agents-route-handler.ts";

const skillPath = (skillId: string, tenantId: string) => `/v1/skills/${skillId}?organizationId=${tenantId}`;

/**
 * `/v1/skills` handlers (decision 0046): the organization's own skills. Reads need
 * `core.agent-settings.read`, writes `core.agent-settings.update`; every write asks the runtime
 * to drop its cached agents, since a cached agent holds its skills.
 */
export const buildCustomSkillsRoutes = (deps: CustomAgentsRouteDeps): Record<string, RouteHandler> => {
  const { pipeline, customAgents } = deps;
  return {
    [listCustomSkillsEndpoint.id]: withApiRoute(listCustomSkillsEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const page = pageRequestOf(ctx.input.query);
      if (page === null) return invalidCursorResponse(ctx.requestId);
      const result = await customAgents.listCustomSkills({ actor: ctx.principal, access: ctx.scope, tenantId, page });
      return result.ok ? listResponse(result.data, page.limit) : customAgentErrorResponse(result.error, ctx.requestId);
    }),
    [getCustomSkillEndpoint.id]: withApiRoute(getCustomSkillEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.getCustomSkill({
        actor: ctx.principal,
        access: ctx.scope,
        tenantId,
        skillId: ctx.input.params.skillId,
      });
      return result.ok ? dataResponse({ data: result.data }) : customAgentErrorResponse(result.error, ctx.requestId);
    }),
    [createCustomSkillEndpoint.id]: withApiRoute(createCustomSkillEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.createCustomSkill({
        actor: ctx.principal,
        access: ctx.scope,
        tenantId,
        requestId: ctx.requestId,
        input: ctx.input.body,
      });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return dataResponse({ data: result.data }, { status: 201, location: skillPath(result.data.id, tenantId) });
    }),
    [updateCustomSkillEndpoint.id]: withApiRoute(updateCustomSkillEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.updateCustomSkill({
        actor: ctx.principal,
        access: ctx.scope,
        tenantId,
        requestId: ctx.requestId,
        skillId: ctx.input.params.skillId,
        input: ctx.input.body,
      });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return dataResponse({ data: result.data });
    }),
    [deleteCustomSkillEndpoint.id]: withApiRoute(deleteCustomSkillEndpoint, pipeline, async (ctx) => {
      const tenantId = tenantOfCall(ctx.principal, ctx.input.query.organizationId, ctx.requestId);
      if (tenantId instanceof Response) return tenantId;
      const result = await customAgents.deleteCustomSkill({
        actor: ctx.principal,
        access: ctx.scope,
        tenantId,
        requestId: ctx.requestId,
        skillId: ctx.input.params.skillId,
      });
      if (!result.ok) return customAgentErrorResponse(result.error, ctx.requestId);
      await invalidateRuntimeCache(deps, ctx, tenantId);
      return noContentResponse();
    }),
  };
};
