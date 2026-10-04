import {
  deleteKnowledgeDocumentEndpoint,
  getKnowledgeDocumentEndpoint,
  listKnowledgeDocumentsEndpoint,
  type Principal,
  type TenantId,
} from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { deniedResponse } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { DeleteDocument } from "../../application/use-cases/delete-document.ts";
import type { GetDocument } from "../../application/use-cases/get-document.ts";
import type { KnowledgeInputError } from "../../application/use-cases/knowledge-input.schema.ts";
import type { ListDocuments } from "../../application/use-cases/list-documents.ts";

export const KNOWLEDGE_READ_PERMISSION = "core.knowledge.read";
export const KNOWLEDGE_DELETE_PERMISSION = "core.knowledge.delete";

/** The knowledge use cases the `/v1` documents routes call. */
export type KnowledgeDocumentsServices = {
  readonly listDocuments: ListDocuments;
  readonly getDocument: GetDocument;
  readonly deleteDocument: DeleteDocument;
};

/**
 * Authorizes `permission` on the organization.
 * @returns the denial response, or `null` when allowed.
 */
export const authorizeOrganization = async (args: {
  authorize: Authorize;
  principal: Principal;
  tenantId: TenantId;
  permission: string;
  requestId: string;
}): Promise<Response | null> => {
  const decision = await args.authorize({
    principal: args.principal,
    permission: args.permission,
    node: { level: "organization", tenantId: args.tenantId },
  });
  return decision.allowed ? null : deniedResponse(decision.reason, args.requestId);
};

const inputErrorResponse = (
  error: KnowledgeInputError | { readonly code: "DOCUMENT_NOT_FOUND" },
  requestId: string,
): Response =>
  error.code === "DOCUMENT_NOT_FOUND"
    ? apiError(404, "NOT_FOUND", requestId)
    : apiError(400, "VALIDATION_FAILED", requestId, error.details);

/**
 * `/v1` handlers of the knowledge documents (SP3 Task 14):
 * `GET /organizations/{organizationId}/knowledge/documents` (cursor pages, newest first),
 * `GET|DELETE .../knowledge/documents/{documentId}`. Reads need `core.knowledge.read`,
 * delete `core.knowledge.delete`; platform documents are never listed or addressable.
 */
export const buildKnowledgeDocumentsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  knowledge: KnowledgeDocumentsServices;
}): Record<string, RouteHandler> => {
  const { pipeline, knowledge } = deps;
  return {
    [listKnowledgeDocumentsEndpoint.id]: withApiRoute(
      listKnowledgeDocumentsEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const tenantId = input.params.organizationId;
        const denied = await authorizeOrganization({
          authorize,
          principal,
          tenantId,
          permission: KNOWLEDGE_READ_PERMISSION,
          requestId,
        });
        if (denied !== null) return denied;
        const { cursor, limit, namespace } = input.query;
        const result = await knowledge.listDocuments({
          tenantId,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          ...(namespace === undefined ? {} : { namespace }),
        });
        if (!result.ok) return inputErrorResponse(result.error, requestId);
        const { documents, nextCursor } = result.data;
        return dataResponse({
          data: documents,
          meta: { page: { cursor: nextCursor, hasMore: nextCursor !== null, limit } },
        });
      },
    ),
    [getKnowledgeDocumentEndpoint.id]: withApiRoute(
      getKnowledgeDocumentEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const { organizationId: tenantId, documentId } = input.params;
        const denied = await authorizeOrganization({
          authorize,
          principal,
          tenantId,
          permission: KNOWLEDGE_READ_PERMISSION,
          requestId,
        });
        if (denied !== null) return denied;
        const result = await knowledge.getDocument({ tenantId, documentId });
        return result.ok ? dataResponse({ data: result.data }) : inputErrorResponse(result.error, requestId);
      },
    ),
    [deleteKnowledgeDocumentEndpoint.id]: withApiRoute(
      deleteKnowledgeDocumentEndpoint,
      pipeline,
      async ({ principal, input, authorize, requestId }) => {
        const { organizationId: tenantId, documentId } = input.params;
        const denied = await authorizeOrganization({
          authorize,
          principal,
          tenantId,
          permission: KNOWLEDGE_DELETE_PERMISSION,
          requestId,
        });
        if (denied !== null) return denied;
        const result = await knowledge.deleteDocument({ tenantId, documentId });
        return result.ok ? noContentResponse() : inputErrorResponse(result.error, requestId);
      },
    ),
  };
};
