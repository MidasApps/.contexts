import { type AccessContext, getAccessContextEndpoint, getMeEndpoint, type Me } from "@core/contracts";
import { queryOptions } from "@tanstack/react-query";
import type { CallEndpoint } from "./call-endpoint.ts";
import { queryKeys } from "./query-keys.ts";

/** A node of the access tree as the URL names it (`/o/:organizationId/p/:projectId?unit=`). */
export type NodeParams = { organizationId: string; projectId?: string | undefined; unitId?: string | undefined };

/**
 * `GET /v1/me` as query options (decision 0011): one cache entry shared by the app shell's session
 * bootstrap and the `session` entity. Pass `enabled` from the session state.
 */
export const meQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: async ({ signal }): Promise<Me> => (await callEndpoint(getMeEndpoint, { signal })).data,
  });

/**
 * `GET /v1/me/context` at a node: effective permissions and regional settings (SP1 spec §10), the
 * input of `can()` and of the intl provider's time zone. Keyed under the organization.
 */
export const accessContextQuery = (callEndpoint: CallEndpoint, node: NodeParams) =>
  queryOptions({
    queryKey: queryKeys.accessContext(node),
    queryFn: async ({ signal }): Promise<AccessContext> => {
      const query = {
        organizationId: node.organizationId,
        ...(node.projectId === undefined ? {} : { projectId: node.projectId }),
        ...(node.projectId === undefined || node.unitId === undefined ? {} : { unitId: node.unitId }),
      };
      return (await callEndpoint(getAccessContextEndpoint, { query, signal })).data;
    },
  });
