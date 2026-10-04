import {
  addKnowledgeSourceEndpoint,
  FORWARDED_HEADERS,
  type KnowledgeSource,
  type TenantId,
  type TenantNodeRef,
} from "@core/contracts";
import { gatewayErrorResponse } from "#/services/agents/adapters/driven/mastra-error-mapper.ts";
import type { AgentCallScope, AgentRuntimeGateway } from "#/services/agents/application/ports/agent-runtime-gateway.ts";
import type { GetReadyFile } from "#/services/files/application/use-cases/read-file-bytes.ts";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import { apiError, dataResponse } from "#/services/shared/http/api-errors.ts";
import { deniedResponse } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";

export const KNOWLEDGE_WRITE_PERMISSION = "core.knowledge.write";
/** Mastra workflow id (`@core/agents` `KNOWLEDGE_INGEST_WORKFLOW_ID`). */
export const KNOWLEDGE_INGEST_WORKFLOW = "knowledge-ingest";

const BEARER = /^Bearer\s+(\S+)$/i;

type SourcesDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly gateway: AgentRuntimeGateway;
  readonly getReadyFile: GetReadyFile;
  readonly resolveAccessContext: ResolveAccessContext;
};

// A file source must be a ready knowledge upload of the same organization.
const checkFileSource = async (
  deps: SourcesDeps,
  tenantId: TenantId,
  source: KnowledgeSource,
  requestId: string,
): Promise<Response | null> => {
  if (source.kind !== "file") return null;
  const file = await deps.getReadyFile({ tenantId, fileId: source.fileId, purpose: "knowledge" });
  if (file.ok) return null;
  if (file.error.code === "FILE_NOT_FOUND") return apiError(404, "NOT_FOUND", requestId);
  if (file.error.code === "FILE_NOT_READY") return apiError(409, "CONFLICT", requestId);
  return apiError(400, "VALIDATION_FAILED", requestId, [{ field: "fileId", issue: "FILE_PURPOSE_MISMATCH" }]);
};

/**
 * `POST /v1/organizations/{organizationId}/knowledge/sources` (SP3 Task 14): authorizes
 * `core.knowledge.write`, checks a file source, then starts the Mastra `knowledge-ingest`
 * workflow through the gateway with the caller's own Bearer and the resolved scope, and
 * answers `202 { data: { runId } }` without waiting for indexing. With `?projectId=` (SP5 Task
 * 14) the permission is checked at that project of the organization and the project goes into
 * the scope, so the workflow indexes into `project:<id>` instead of the organization namespace.
 */
export const buildKnowledgeSourcesRoutes = (deps: SourcesDeps): Record<string, RouteHandler> => ({
  [addKnowledgeSourceEndpoint.id]: withApiRoute(
    addKnowledgeSourceEndpoint,
    deps.pipeline,
    async ({ principal, input, authorize, requestId, request }) => {
      const tenantId = input.params.organizationId;
      const { projectId } = input.query;
      const node: TenantNodeRef =
        projectId === undefined ? { level: "organization", tenantId } : { level: "project", tenantId, projectId };
      const decision = await authorize({ principal, permission: KNOWLEDGE_WRITE_PERMISSION, node });
      if (!decision.allowed) return deniedResponse(decision.reason, requestId);
      const fileProblem = await checkFileSource(deps, tenantId, input.body, requestId);
      if (fileProblem !== null) return fileProblem;
      const context = await deps.resolveAccessContext({ principal, node });
      const bearer = BEARER.exec(request.headers.get(FORWARDED_HEADERS.authorization) ?? "")?.[1];
      if (context === null || bearer === undefined) return apiError(403, "FORBIDDEN", requestId);
      const traceparent = request.headers.get(FORWARDED_HEADERS.traceparent);
      const scope: AgentCallScope = {
        bearer,
        tenantId,
        ...(projectId === undefined ? {} : { projectId }),
        regional: context.regional,
        requestId,
        ...(traceparent === null ? {} : { traceparent }),
        signal: request.signal,
      };
      const launched = await deps.gateway.launchWorkflow({
        scope,
        workflowId: KNOWLEDGE_INGEST_WORKFLOW,
        inputData: { source: input.body },
      });
      return launched.ok
        ? dataResponse({ data: { runId: launched.data.runId } }, { status: 202 })
        : gatewayErrorResponse(launched.error, requestId);
    },
  ),
});
