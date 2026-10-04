"use client";

import {
  type ApprovalRequest,
  type ApprovalStatus,
  getApprovalRequestEndpoint,
  listApprovalRequestsEndpoint,
} from "@core/contracts";
import { type InfiniteData, queryOptions } from "@tanstack/react-query";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import {
  type CollectedPages,
  collectPages,
  cursorListQuery,
  type ListPage,
  mergePages,
  nullOnNotFound,
  pageQuery,
} from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";

/** The pending inbox reads at most this many pages of 100 requests; beyond that it says the list was cut. */
export const APPROVALS_MAX_PAGES = 3;
const PAGE_LIMIT = 100;

/** Under `["organizations", id]`: leaving or switching the organization drops its requests. */
export const approvalRequestKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "approval-requests"),
  list: (organizationId: string, status: ApprovalStatus | undefined): QueryKey =>
    queryKeys.organizationScoped(organizationId, "approval-requests", "list", status ?? "all"),
  history: (organizationId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "approval-requests", "history"),
  one: (organizationId: string, approvalRequestId: string): QueryKey =>
    queryKeys.organizationScoped(organizationId, "approval-requests", "one", approvalRequestId),
};

/**
 * `GET /v1/organizations/{organizationId}/approval-requests` (core.approval.read), optionally one
 * status, read whole up to `APPROVALS_MAX_PAGES`; `truncated` says the cap cut it.
 */
export const approvalRequestsQuery = (callEndpoint: CallEndpoint, organizationId: string, status?: ApprovalStatus) =>
  queryOptions({
    queryKey: approvalRequestKeys.list(organizationId, status),
    queryFn: ({ signal }): Promise<CollectedPages<ApprovalRequest>> =>
      collectPages<ApprovalRequest>(
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

/** Page size of the settled requests list (the history tab). */
export const APPROVAL_HISTORY_PAGE_SIZE = 20;

const settledOf = (data: InfiniteData<ListPage<ApprovalRequest>, string | undefined>): readonly ApprovalRequest[] =>
  mergePages(data).filter((request) => request.status !== "pending");

/**
 * The settled requests, newest first, one cursor page at a time (the history grows without bound,
 * so it is never read whole). The API filters one status at a time, so every request is listed and
 * the pending ones are dropped here.
 */
export const approvalHistoryQuery = (callEndpoint: CallEndpoint, organizationId: string) => ({
  ...cursorListQuery<ApprovalRequest>({
    queryKey: approvalRequestKeys.history(organizationId),
    fetchPage: (cursor, signal) =>
      callEndpoint(listApprovalRequestsEndpoint, {
        params: { organizationId },
        query: pageQuery(cursor, APPROVAL_HISTORY_PAGE_SIZE),
        signal,
      }),
  }),
  select: settledOf,
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
      const request = await nullOnNotFound(
        async () => (await callEndpoint(getApprovalRequestEndpoint, { params: { approvalRequestId }, signal })).data,
      );
      return request === null || request.tenantId !== organizationId ? null : request;
    },
  });
