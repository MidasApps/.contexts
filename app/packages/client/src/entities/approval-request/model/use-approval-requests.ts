import type { ApprovalRequest, ApprovalStatus } from "@core/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ApprovalApiError, ApprovalRequestsApi } from "../api/approval-requests-api.ts";

/** Refetch period when no live listener is allowed (SP5 spec §3.4). */
export const APPROVALS_POLL_MS = 15_000;

/**
 * A live source of change notices (a Firestore listener on `approval-requests` once SP1's Rules let
 * approvers read them). `onDenied` reports a refused listener; the hook then polls.
 * @returns the unsubscribe function.
 */
export type ApprovalChangeSource = (handlers: { readonly onChange: () => void; readonly onDenied: () => void }) => () => void;

export type UseApprovalRequestsArgs = {
  readonly api: Pick<ApprovalRequestsApi, "list">;
  readonly organizationId: string | null;
  readonly status?: ApprovalStatus;
  readonly live?: ApprovalChangeSource;
};

export type UseApprovalRequestsResult = {
  readonly requests: readonly ApprovalRequest[];
  /** Pending requests the viewer did not ask for (the user menu badge). */
  readonly pendingCount: number;
  readonly isLoading: boolean;
  readonly error: ApprovalApiError | null;
  readonly mode: "listener" | "polling";
};

export const approvalRequestsQueryKey = (organizationId: string | null, status: ApprovalStatus | undefined) => ["approval-requests", organizationId, status ?? "all"] as const;

class ApprovalQueryError extends Error {
  readonly apiError: ApprovalApiError;

  constructor(apiError: ApprovalApiError) {
    super(apiError.code);
    this.name = "ApprovalQueryError";
    this.apiError = apiError;
  }
}

/**
 * The approvals inbox data (SP5 spec §3.4): one page of the organization's requests. With a live
 * source the list refetches on each change notice; without one, or once the listener is denied, it
 * refetches every 15 s and when the window regains focus.
 * @param viewerUid excludes the viewer's own requests from `pendingCount` (they cannot approve them).
 */
export const useApprovalRequests = (args: UseApprovalRequestsArgs, viewerUid: string | null): UseApprovalRequestsResult => {
  const { api, organizationId, status, live } = args;
  const queryClient = useQueryClient();
  // The source that refused to listen; a new source gets its own chance.
  const [deniedSource, setDeniedSource] = useState<ApprovalChangeSource | null>(null);
  const listening = live !== undefined && organizationId !== null && deniedSource !== live;
  const queryKey = approvalRequestsQueryKey(organizationId, status);

  useEffect(() => {
    if (live === undefined || organizationId === null) return undefined;
    return live({
      onChange: () => void queryClient.invalidateQueries({ queryKey: approvalRequestsQueryKey(organizationId, status) }),
      onDenied: () => setDeniedSource(() => live),
    });
  }, [live, organizationId, status, queryClient]);

  const query = useQuery({
    queryKey,
    enabled: organizationId !== null,
    refetchInterval: listening ? false : APPROVALS_POLL_MS,
    refetchOnWindowFocus: !listening,
    queryFn: async () => {
      const result = await api.list({ organizationId: organizationId ?? "", ...(status === undefined ? {} : { status }) });
      if (!result.ok) throw new ApprovalQueryError(result.error);
      return result.data.items;
    },
  });

  const requests = query.data ?? [];
  const pendingCount = requests.filter((request) => request.status === "pending" && request.requestedBy.id !== viewerUid).length;
  const error = query.error instanceof ApprovalQueryError ? query.error.apiError : query.error === null ? null : { status: 0, code: "INTERNAL_ERROR", messageKey: "errors.INTERNAL_ERROR" as const };
  return { requests, pendingCount, isLoading: query.isLoading, error, mode: listening ? "listener" : "polling" };
};
