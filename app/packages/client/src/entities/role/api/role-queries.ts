"use client";

import { listPermissionsEndpoint, listRolesEndpoint, type PermissionDefinition, type Role } from "@core/contracts";
import { queryOptions, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, collectAllPages, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Custom role keys under the organization; the permission registry is a platform catalog. */
export const roleKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "roles"),
  permissionsCatalog: (): QueryKey => ["catalog", "permissions"],
};

/** Every custom role of the organization (roles are few; pickers need the whole list). */
export const rolesQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: roleKeys.all(organizationId),
    queryFn: ({ signal }): Promise<Role[]> =>
      collectAllPages(
        (cursor, pageSignal) => callEndpoint(listRolesEndpoint, { params: { organizationId }, query: pageQuery(cursor, COLLECT_PAGE_LIMIT), signal: pageSignal }),
        signal,
      ),
  });

/** Every registered permission (`GET /v1/permissions`: core and modules), 5 min fresh. */
export const permissionsCatalogQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: roleKeys.permissionsCatalog(),
    queryFn: ({ signal }): Promise<PermissionDefinition[]> =>
      collectAllPages((cursor, pageSignal) => callEndpoint(listPermissionsEndpoint, { query: pageQuery(cursor, COLLECT_PAGE_LIMIT), signal: pageSignal }), signal),
    staleTime: 5 * 60_000,
  });

/** Custom roles of the organization (system roles come from `SYSTEM_ROLE_KEYS`). */
export const useRoles = (organizationId: string | undefined): UseQueryResult<Role[]> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({ ...rolesQuery(callEndpoint, organizationId ?? ""), enabled: signedIn && organizationId !== undefined && organizationId !== "" });
};

/** The permission registry, for the role editor's picker grouped by module. */
export const usePermissionsCatalog = (): UseQueryResult<PermissionDefinition[]> => {
  const callEndpoint = useCallEndpoint();
  return useQuery({ ...permissionsCatalogQuery(callEndpoint), enabled: useIsSignedIn() });
};
