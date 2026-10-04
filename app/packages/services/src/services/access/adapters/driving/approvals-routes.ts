import {
  approveApprovalRequestEndpoint,
  createApprovalRequestEndpoint,
  getApprovalRequestEndpoint,
  listApprovalRequestsEndpoint,
  rejectApprovalRequestEndpoint,
} from "@core/contracts";
import { apiError, type DomainErrorMapping, dataResponse, mapDomainError } from "../../../shared/http/api-errors.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { ApprovalServices } from "../../approval-composition.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { ApprovalInputInvalidError } from "../../domain/errors/approval-errors.ts";

/** Wire status of each approval error code (SP1 spec §7.3). */
const APPROVAL_ERROR_MAPPING: DomainErrorMapping = {
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
  SELF_APPROVAL_FORBIDDEN: { status: 403 },
  UNKNOWN_APPROVAL_ACTION: { status: 422 },
  APPROVAL_NOT_REQUIRED: { status: 422 },
};

/** @throws the error when it is not an expected approval error (the boundary answers 500). */
const approvalErrorResponse = (error: Error & { readonly code: string }, requestId: string): Response => {
  if (error instanceof AccessDeniedError) return deniedResponse(error.reason, requestId);
  if (error instanceof ApprovalInputInvalidError)
    return apiError(400, "VALIDATION_FAILED", requestId, [...error.details]);
  return mapDomainError(error, APPROVAL_ERROR_MAPPING, requestId);
};

/**
 * `/v1` approval handlers (SP1 spec §6.5, §7.3): list and create under an organization,
 * read, approve and reject by id. Approving answers 200 with the request after its single
 * execution (`executed` or `failed`).
 */
export const buildApprovalsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  approvals: ApprovalServices;
}): Record<string, RouteHandler> => {
  const { pipeline, approvals } = deps;
  return {
    [listApprovalRequestsEndpoint.id]: withApiRoute(
      listApprovalRequestsEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const page = pageRequestOf(input.query);
        if (page === null) return invalidCursorResponse(requestId);
        const result = await approvals.listApprovalRequests({
          actor: principal,
          access: scope,
          tenantId: input.params.organizationId,
          status: input.query.status,
          page,
        });
        return result.ok ? listResponse(result.data, page.limit) : approvalErrorResponse(result.error, requestId);
      },
    ),
    [createApprovalRequestEndpoint.id]: withApiRoute(
      createApprovalRequestEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await approvals.requestApproval({
          principal,
          access: scope,
          tenantId: input.params.organizationId,
          input: input.body,
          requestId,
        });
        if (!result.ok) return approvalErrorResponse(result.error, requestId);
        return dataResponse(
          { data: result.data },
          { status: 201, location: `/v1/approval-requests/${result.data.id}` },
        );
      },
    ),
    [getApprovalRequestEndpoint.id]: withApiRoute(
      getApprovalRequestEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await approvals.readApprovalRequest({
          actor: principal,
          access: scope,
          approvalRequestId: input.params.approvalRequestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : approvalErrorResponse(result.error, requestId);
      },
    ),
    [approveApprovalRequestEndpoint.id]: withApiRoute(
      approveApprovalRequestEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await approvals.approveRequest({
          actor: principal,
          access: scope,
          approvalRequestId: input.params.approvalRequestId,
          reason: input.body.reason,
          requestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : approvalErrorResponse(result.error, requestId);
      },
    ),
    [rejectApprovalRequestEndpoint.id]: withApiRoute(
      rejectApprovalRequestEndpoint,
      pipeline,
      async ({ principal, input, scope, requestId }) => {
        const result = await approvals.rejectRequest({
          actor: principal,
          access: scope,
          approvalRequestId: input.params.approvalRequestId,
          reason: input.body.reason,
          requestId,
        });
        return result.ok ? dataResponse({ data: result.data }) : approvalErrorResponse(result.error, requestId);
      },
    ),
  };
};
