import {
  activateAddendumEndpoint,
  adminActivatePromptEndpoint,
  adminCreatePromptVersionEndpoint,
  adminEvaluatePromptVersionEndpoint,
  adminListPromptActivationsEndpoint,
  adminListPromptVersionsEndpoint,
  createAddendumVersionEndpoint,
  evaluateAddendumVersionEndpoint,
  listAddendumActivationsEndpoint,
  listAddendumVersionsEndpoint,
} from "@core/contracts";
import { requireStaff, requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { PromptEvalError } from "../../application/ports/prompt-eval-gateway.ts";
import type { PromptKey } from "../../application/ports/prompt-repository.ts";
import type { ActivationError } from "../../application/use-cases/activate-prompt-version.ts";
import type { PromptServices } from "../../prompt-composition.ts";

export const PROMPT_PERMISSIONS = {
  read: "core.prompt.read",
  write: "core.prompt.write",
  manage: "platform.prompt.manage",
} as const;

const activationErrorResponse = (error: ActivationError, requestId: string): Response =>
  error.code === "NOT_FOUND"
    ? apiError(404, "NOT_FOUND", requestId)
    : error.code === "EVAL_REQUIRED"
      ? apiError(409, "EVAL_REQUIRED", requestId)
      : apiError(403, "FORBIDDEN", requestId);

const evalErrorResponse = (error: PromptEvalError, requestId: string): Response =>
  apiError(error.status, error.code, requestId);

const platformKey = (agentId: string): PromptKey => ({ agentId, scope: "platform", tenantId: null });
const tenantKey = (agentId: string, tenantId: string): PromptKey => ({ agentId, scope: "tenant", tenantId });

/**
 * `/v1/admin/agents/{agentId}/prompt-versions|activations` (staff, `platform.prompt.manage`, the
 * platform instructions) and `/v1/agents/{agentId}/prompt-addendum/*` (the organization of the call,
 * `core.prompt.read|write`): versions are append-only, activation is eval-gated (decision 0038).
 */
const buildAdminPromptRoutes = (deps: {
  readonly pipeline: ApiRouteDeps;
  readonly prompts: PromptServices;
}): Record<string, RouteHandler> => {
  const staff = (ctx: Parameters<typeof requireStaff>[0]) =>
    requireStaff(ctx, { permission: PROMPT_PERMISSIONS.manage });
  return {
    [adminListPromptVersionsEndpoint.id]: withApiRoute(adminListPromptVersionsEndpoint, deps.pipeline, async (ctx) => {
      const denied = await staff(ctx);
      return denied ?? dataResponse({ data: await deps.prompts.listVersions(platformKey(ctx.input.params.agentId)) });
    }),
    [adminCreatePromptVersionEndpoint.id]: withApiRoute(
      adminCreatePromptVersionEndpoint,
      deps.pipeline,
      async (ctx) => {
        const denied = await staff(ctx);
        if (denied !== null) return denied;
        const version = await deps.prompts.createVersion({
          actor: ctx.principal,
          key: platformKey(ctx.input.params.agentId),
          input: ctx.input.body,
          requestId: ctx.requestId,
        });
        return dataResponse({ data: version }, { status: 201 });
      },
    ),
    [adminEvaluatePromptVersionEndpoint.id]: withApiRoute(
      adminEvaluatePromptVersionEndpoint,
      deps.pipeline,
      async (ctx) => {
        const denied = await staff(ctx);
        if (denied !== null) return denied;
        const { agentId, versionId } = ctx.input.params;
        const result = await deps.prompts.runEval({
          actor: ctx.principal,
          key: platformKey(agentId),
          versionId,
          requestId: ctx.requestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : evalErrorResponse(result.error, ctx.requestId);
      },
    ),
    [adminListPromptActivationsEndpoint.id]: withApiRoute(
      adminListPromptActivationsEndpoint,
      deps.pipeline,
      async (ctx) => {
        const denied = await staff(ctx);
        return (
          denied ?? dataResponse({ data: await deps.prompts.listActivations(platformKey(ctx.input.params.agentId)) })
        );
      },
    ),
    [adminActivatePromptEndpoint.id]: withApiRoute(adminActivatePromptEndpoint, deps.pipeline, async (ctx) => {
      const denied = await staff(ctx);
      if (denied !== null) return denied;
      const result = await deps.prompts.activate({
        actor: ctx.principal,
        by: "staff",
        key: platformKey(ctx.input.params.agentId),
        input: ctx.input.body,
        requestId: ctx.requestId,
      });
      return result.ok
        ? dataResponse({ data: result.data }, { status: 201 })
        : activationErrorResponse(result.error, ctx.requestId);
    }),
  };
};

const buildAddendumRoutes = (deps: {
  readonly pipeline: ApiRouteDeps;
  readonly prompts: PromptServices;
}): Record<string, RouteHandler> => ({
  [listAddendumVersionsEndpoint.id]: withApiRoute(listAddendumVersionsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: PROMPT_PERMISSIONS.read,
    });
    return tenantId instanceof Response
      ? tenantId
      : dataResponse({ data: await deps.prompts.listVersions(tenantKey(ctx.input.params.agentId, tenantId)) });
  }),
  [createAddendumVersionEndpoint.id]: withApiRoute(createAddendumVersionEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: PROMPT_PERMISSIONS.write,
    });
    if (tenantId instanceof Response) return tenantId;
    const version = await deps.prompts.createVersion({
      actor: ctx.principal,
      key: tenantKey(ctx.input.params.agentId, tenantId),
      input: ctx.input.body,
      requestId: ctx.requestId,
    });
    return dataResponse({ data: version }, { status: 201 });
  }),
  [evaluateAddendumVersionEndpoint.id]: withApiRoute(evaluateAddendumVersionEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: PROMPT_PERMISSIONS.write,
    });
    if (tenantId instanceof Response) return tenantId;
    const { agentId, versionId } = ctx.input.params;
    const result = await deps.prompts.runEval({
      actor: ctx.principal,
      key: tenantKey(agentId, tenantId),
      versionId,
      requestId: ctx.requestId,
    });
    return result.ok ? dataResponse({ data: result.data }) : evalErrorResponse(result.error, ctx.requestId);
  }),
  [listAddendumActivationsEndpoint.id]: withApiRoute(listAddendumActivationsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: PROMPT_PERMISSIONS.read,
    });
    return tenantId instanceof Response
      ? tenantId
      : dataResponse({ data: await deps.prompts.listActivations(tenantKey(ctx.input.params.agentId, tenantId)) });
  }),
  [activateAddendumEndpoint.id]: withApiRoute(activateAddendumEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: PROMPT_PERMISSIONS.write,
    });
    if (tenantId instanceof Response) return tenantId;
    const key = tenantKey(ctx.input.params.agentId, tenantId);
    const result = await deps.prompts.activate({
      actor: ctx.principal,
      by: "tenant",
      key,
      input: ctx.input.body,
      requestId: ctx.requestId,
    });
    return result.ok
      ? dataResponse({ data: result.data }, { status: 201 })
      : activationErrorResponse(result.error, ctx.requestId);
  }),
});

export const buildPromptRoutes = (deps: {
  readonly pipeline: ApiRouteDeps;
  readonly prompts: PromptServices;
}): Record<string, RouteHandler> => ({
  ...buildAdminPromptRoutes(deps),
  ...buildAddendumRoutes(deps),
});
