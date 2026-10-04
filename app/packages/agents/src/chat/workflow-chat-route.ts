import type { Logger } from "@core/services";
import { handleWorkflowStream, withSseHeartbeat } from "@mastra/ai-sdk";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import {
  authorizeCaller,
  inputsOf,
  type RouteInputs,
  routeError,
  validateWorkflowInput,
} from "../workflows/runs/workflow-route-http.ts";
import { WORKFLOW_RUN_PERMISSIONS } from "../workflows/runs/workflow-run-routes.ts";
import type { WorkflowCatalog } from "../workflows/workflow-catalog.ts";
import { CHAT_HEARTBEAT_MS } from "./chat-routes.ts";

/** Under `/chat/*`, so the chat context middleware verifies the caller (decision 0040, D5-07). */
export const WORKFLOW_CHAT_ROUTE_PATH = "/chat/workflows/:workflowId";

const BodySchema = z.strictObject({ inputData: z.record(z.string(), z.unknown()) });

export type WorkflowChatRouteDeps = {
  readonly access: Parameters<typeof authorizeCaller>[0]["access"];
  readonly catalog: WorkflowCatalog;
  readonly logger: Pick<Logger, "error">;
};

/**
 * `POST /chat/workflows/:workflowId`: starts a startable workflow as the caller and streams it as
 * AI SDK v7 `data-workflow` parts (`handleWorkflowStream`, the `workflowRoute` handler), so a
 * chat shows its progress. Same checks as `/workflow-runs/start`: `core.workflow-run.start`, the
 * catalog's `startable` flag and the workflow's input schema; the resource is `tenantId:uid`.
 */
export const handleWorkflowChatPost = async (
  input: RouteInputs & { readonly workflowId: string; readonly readBody: () => Promise<unknown> },
  deps: WorkflowChatRouteDeps,
): Promise<Response> => {
  const { mastra, requestContext, workflowId } = input;
  const caller = await authorizeCaller({
    access: deps.access,
    requestContext,
    permission: WORKFLOW_RUN_PERMISSIONS.start,
  });
  if (!caller.ok) return caller.response;
  const policy = deps.catalog.get(workflowId);
  if (policy === undefined) return routeError("NOT_FOUND", requestContext);
  if (!policy.startable) return routeError("WORKFLOW_NOT_STARTABLE", requestContext);
  const body = BodySchema.safeParse(await input.readBody().catch(() => undefined));
  if (!body.success) return routeError("VALIDATION_FAILED", requestContext, [{ field: "inputData", issue: "INVALID" }]);
  const valid = await validateWorkflowInput(mastra.getWorkflow(workflowId).inputSchema, body.data.inputData);
  if (!valid.ok) return routeError("VALIDATION_FAILED", requestContext, valid.details);
  const { context } = caller.data;
  try {
    const stream = await handleWorkflowStream({
      mastra,
      workflowId,
      version: "v7",
      params: { inputData: body.data.inputData, resourceId: `${context.tenantId}:${context.userId}`, requestContext },
    });
    return withSseHeartbeat(createUIMessageStreamResponse({ stream }), CHAT_HEARTBEAT_MS);
  } catch (error: unknown) {
    deps.logger.error("workflow_chat_stream_failed", { requestId: context.requestId, workflowId, err: error });
    return routeError("INTERNAL_ERROR", requestContext);
  }
};

export const createWorkflowChatRoutes = (deps: WorkflowChatRouteDeps): ApiRoute[] => [
  registerApiRoute(WORKFLOW_CHAT_ROUTE_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (c) =>
      handleWorkflowChatPost(
        { ...inputsOf(c), workflowId: c.req.param("workflowId"), readBody: () => c.req.json() },
        deps,
      ),
  }),
];
