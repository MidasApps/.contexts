"use client";

import { getApprovalRequestEndpoint, listApprovalRequestsEndpoint, type ApprovalRequest, type ApprovalStatus } from "@core/contracts";
import { queryOptions } from "@tanstack/react-query";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { collectAllPages, nullOnNotFound, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";

/** The inbox reads at most this many pages of 100 requests; anything beyond is not shown. */
export const APPROVALS_MAX_PAGES = 3;
const PAGE_LIMIT = 100;

/** Under `["organizations", id]`: leaving or switching the organization drops its requests. */
export const approvalRequestKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "approval-requests"),
  list: (organizationId: string, status: ApprovalStatus | undefined): QueryKey =>
    queryKeys.organizationScoped(organizationId, "approval-requests", "list", status ?? "all"),
  one: (organizationId: string, approvalRequestId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "approval-requests", "one", approvalRequestId),
};

/** `GET /v1/organizations/{organizationId}/approval-requests` (core.approval.read), optionally one status. */
export const approvalRequestsQuery = (callEndpoint: CallEndpoint, organizationId: string, status?: ApprovalStatus) =>
  queryOptions({
    queryKey: approvalRequestKeys.list(organizationId, status),
    queryFn: ({ signal }): Promise<ApprovalRequest[]> =>
      collectAllPages<ApprovalRequest>(
        (cursor, pageSignal) =>
          callEndpoint(listApprovalRequestsEndpoint, {
            params: { organizationId },
            query: { ...pageQuery(cursor, PAGE_LIMIT), ...(status === undefined ? {} : { status }) },
            signal: pageSignal,
          }),
        signal,
        APPROVALS_MAX_PAGES,
      ),
  });

/**
 * `GET /v1/approval-requests/{id}`: one request, or `null` when it does not exist or the viewer
 * cannot see it (the API answers 404 for both). A request of another organization is `null` too:
 * the page lives under one organization and never shows another's data.
 */
export const approvalRequestQuery = (callEndpoint: CallEndpoint, organizationId: string, approvalRequestId: string) =>
  queryOptions({
    queryKey: approvalRequestKeys.one(organizationId, approvalRequestId),
    queryFn: async ({ signal }): Promise<ApprovalRequest | null> => {
      const request = await nullOnNotFound(async () => (await callEndpoint(getApprovalRequestEndpoint, { params: { approvalRequestId }, signal })).data);
      return request === null || request.tenantId !== organizationId ? null : request;
    },
  });
