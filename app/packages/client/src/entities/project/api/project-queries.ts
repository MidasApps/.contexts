"use client";

import { getProjectEndpoint, listProjectsEndpoint, type Project } from "@core/contracts";
import { queryOptions, useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, cursorListQuery, nullOnNotFound, pageQuery } from "#/shared/api/cursor-list.ts";
import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Project query keys, all under the organization (`["organizations", id, "projects", …]`). */
export const projectKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "projects"),
  list: (organizationId: string, limit: number): QueryKey => queryKeys.organizationScoped(organizationId, "projects", "list", { limit }),
  detail: (organizationId: string, projectId: string): QueryKey => queryKeys.organizationScoped(organizationId, "projects", "detail", projectId),
};

/** Visible projects of an organization (`GET /v1/organizations/{id}/projects`), merged pages. */
export const projectsQuery = (callEndpoint: CallEndpoint, organizationId: string, limit = COLLECT_PAGE_LIMIT) =>
  cursorListQuery({
    queryKey: projectKeys.list(organizationId, limit),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listProjectsEndpoint, { params: { organizationId }, query: pageQuery(cursor, limit), signal }),
  });

/** `GET /v1/projects/{id}`, keyed under its organization; `null` when not visible (404). */
export const projectQuery = (callEndpoint: CallEndpoint, node: { organizationId: string; projectId: string }) =>
  queryOptions({
    queryKey: projectKeys.detail(node.organizationId, node.projectId),
    queryFn: ({ signal }): Promise<Project | null> =>
      nullOnNotFound(async () => (await callEndpoint(getProjectEndpoint, { params: { projectId: node.projectId }, signal })).data),
  });

/** The organization's projects the viewer can see; `fetchNextPage` loads more. */
export const useProjects = (organizationId: string | undefined) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({ ...projectsQuery(callEndpoint, organizationId ?? ""), enabled: signedIn && organizationId !== undefined && organizationId !== "" });
};

/** One project (`data === null`: not visible). Disabled until both ids are known. */
export const useProject = (node: { organizationId: string; projectId: string | undefined } | null): UseQueryResult<Project | null> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const projectId = node?.projectId ?? "";
  return useQuery({ ...projectQuery(callEndpoint, { organizationId: node?.organizationId ?? "", projectId }), enabled: signedIn && node !== null && projectId !== "" });
};
