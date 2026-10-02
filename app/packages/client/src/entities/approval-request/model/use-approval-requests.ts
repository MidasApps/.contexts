"use client";

import type { ApprovalRequest, ApprovalStatus } from "@core/contracts";
import { useInfiniteQuery, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CollectedPages } from "#/shared/api/cursor-list.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { approvalHistoryQuery, approvalRequestKeys, approvalRequestQuery, approvalRequestsQuery } from "../api/approval-request-queries.ts";

/** Refetch period when no live listener is allowed (SP5 spec §3.4). */
export const APPROVALS_POLL_MS = 15_000;

/**
 * A live source of change notices (a Firestore listener on `approval-requests` once SP1's Rules let
 * approvers read them). `onDenied` reports a refused listener; the hook then polls.
 * @returns the unsubscribe function.
 */
export type ApprovalChangeSource = (handlers: { readonly onChange: () => void; readonly onDenied: () => void }) => () => void;

export type UseApprovalRequestsArgs = {
  /** `null` disables the query (no organization in the URL). */
  readonly organizationId: string | null;
  readonly status?: ApprovalStatus | undefined;
  readonly live?: ApprovalChangeSource | undefined;
  readonly enabled?: boolean | undefined;
};

export type UseApprovalRequestsResult = {
  readonly query: UseQueryResult<CollectedPages<ApprovalRequest>>;
  readonly requests: readonly ApprovalRequest[];
  /** The read stopped at `APPROVALS_MAX_PAGES` with more requests left: the view must say so. */
  readonly truncated: boolean;
  readonly mode: "listener" | "polling";
};

/** Pending requests the viewer did not ask for: the ones that may wait for their decision (four eyes). */
export const waitingForDecision = (requests: readonly ApprovalRequest[], viewerUid: string | null): ApprovalRequest[] =>
  requests.filter((request) => request.status === "pending" && request.requestedBy.id !== viewerUid);

/**
 * The approvals inbox data (SP5 spec §3.4): the organization's requests. With a live source the
 * list refetches on each change notice; without one, or once the listener is denied, it refetches
 * every 15 s and when the window regains focus.
 */
export const useApprovalRequests = ({ organizationId, status, live, enabled = true }: UseApprovalRequestsArgs): UseApprovalRequestsResult => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const queryClient = useQueryClient();
  // The source that refused to listen; a new source gets its own chance.
  const [deniedSource, setDeniedSource] = useState<ApprovalChangeSource | null>(null);
  const listening = live !== undefined && organizationId !== null && deniedSource !== live;
  useEffect(() => {
    if (live === undefined || organizationId === null) return undefined;
    return live({
      onChange: () => void queryClient.invalidateQueries({ queryKey: approvalRequestKeys.all(organizationId) }),
      onDenied: () => setDeniedSource(() => live),
    });
  }, [live, organizationId, queryClient]);
  const query = useQuery({
    ...approvalRequestsQuery(callEndpoint, organizationId ?? "", status),
    enabled: signedIn && enabled && organizationId !== null,
    refetchInterval: listening ? false : APPROVALS_POLL_MS,
    refetchOnWindowFocus: !listening,
  });
  return { query, requests: query.data?.items ?? [], truncated: query.data?.truncated ?? false, mode: listening ? "listener" : "polling" };
};

/**
 * The settled requests (the history tab), one cursor page at a time and only once asked for. A
 * decision invalidates every list of the organization, so a new settled request shows up then.
 */
export const useApprovalHistory = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...approvalHistoryQuery(callEndpoint, organizationId), enabled: signedIn && organizationId !== "" && options.enabled !== false });
};

/** One request by id (the detail page); polls like the inbox while it is pending. */
export const useApprovalRequest = (organizationId: string, approvalRequestId: string) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...approvalRequestQuery(callEndpoint, organizationId, approvalRequestId),
    enabled: signedIn && organizationId !== "" && approvalRequestId !== "",
    refetchInterval: (query) => (query.state.data?.status === "pending" ? APPROVALS_POLL_MS : false),
  });
};
