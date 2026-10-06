"use client";

import type { AccessContext } from "@core/contracts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { accessContextQuery, type NodeParams } from "#/shared/api/core-queries.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

const NO_NODE: NodeParams = { organizationId: "" };

/**
 * Effective permissions and regional settings at `node` (`GET /v1/me/context`, SP1 spec §10), the
 * same cache entry the intl provider reads. `null` disables it (no organization in the URL). A
 * node the user cannot see fails with a 404 `ApiError` (views render not-found).
 */
export const useAccessContext = (node: NodeParams | null): UseQueryResult<AccessContext> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...accessContextQuery(callEndpoint, node ?? NO_NODE), enabled: signedIn && node !== null });
};
