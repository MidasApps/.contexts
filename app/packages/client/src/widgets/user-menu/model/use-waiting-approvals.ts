"use client";

import { useApprovalRequests, waitingForDecision } from "#/entities/approval-request/index.ts";
import { usePermissions } from "#/entities/permission/index.ts";
import { useCurrentNode, useMe } from "#/entities/session/index.ts";

/**
 * Requests waiting for the viewer's decision in the organization of the URL (pending, asked by
 * someone else), for the user menu badge. `null` outside an organization or without
 * `core.approval.read` there: nothing is fetched and no entry is shown.
 */
export const useWaitingApprovals = (): { organizationId: string; count: number } | null => {
  const node = useCurrentNode();
  const me = useMe();
  const organizationId = node?.organizationId ?? null;
  const permissions = usePermissions(organizationId === null ? null : { organizationId });
  const allowed = organizationId !== null && permissions.can("core.approval.read");
  const pending = useApprovalRequests({ organizationId, status: "pending", enabled: allowed });
  if (organizationId === null || !allowed) return null;
  return {
    organizationId,
    count: me.data === undefined ? 0 : waitingForDecision(pending.requests, me.data.uid).length,
  };
};
