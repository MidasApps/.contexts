"use client";

import { listMyGrantsEndpoint, type MyGrant, type TenantNodeRef } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { collectAllPages, COLLECT_PAGE_LIMIT, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/**
 * `GET /v1/me/grants?organizationId=` (decision 0030 A7): the live nodes where the viewer holds
 * grants in the organization, widest first, with the roles there. Grants carry nodes and roles,
 * not permissions: what the viewer may do still comes from the access context (`usePermissions`).
 */
export const myGrantsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationScoped(organizationId, "my-grants"),
    queryFn: ({ signal }): Promise<MyGrant[]> =>
      collectAllPages<MyGrant>(
        (cursor, pageSignal) => callEndpoint(listMyGrantsEndpoint, { query: { ...pageQuery(cursor, COLLECT_PAGE_LIMIT), organizationId }, signal: pageSignal }),
        signal,
      ),
  });

/** The viewer's grant nodes in an organization; idle without one. */
export const useMyGrants = (organizationId: string | null | undefined, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const known = organizationId !== null && organizationId !== undefined && organizationId !== "";
  return useQuery({ ...myGrantsQuery(callEndpoint, known ? organizationId : ""), enabled: signedIn && known && options.enabled !== false });
};

const covers = (grant: TenantNodeRef, node: TenantNodeRef): boolean => {
  if (grant.tenantId !== node.tenantId) return false;
  if (grant.level === "organization") return true;
  if (node.level === "organization") return false;
  if (grant.projectId !== node.projectId) return false;
  if (grant.level === "project") return true;
  // A unit grant covers that unit and the units below it. A node reference does not carry its
  // ancestors, so another unit of the same project may or may not be below: it is not ruled out
  // here and the API decides.
  return node.level === "unit";
};

/**
 * Whether one of the viewer's grant nodes covers `node`: the same node or one above it (grants
 * inherit downwards, SP1 spec §5.2). `false` means an action at `node` would be refused whatever
 * the viewer's roles elsewhere; `true` still needs the permission (access context) and the API.
 */
export const grantCoversNode = (grants: readonly Pick<MyGrant, "node">[], node: TenantNodeRef): boolean => grants.some((grant) => covers(grant.node, node));
