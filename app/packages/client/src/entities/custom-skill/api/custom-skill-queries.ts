"use client";

import { type CustomSkill, listCustomSkillsEndpoint } from "@core/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, collectAllPages, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/** Under `["organizations", id]`: one organization's skills never show in another's cache. */
export const customSkillKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "custom-skills"),
};

/**
 * `GET /v1/skills?organizationId=` (core.agent-settings.read): the organization's own skills,
 * newest first. The plan caps how many exist, so the short list is read whole.
 */
export const customSkillsQuery = (callEndpoint: CallEndpoint, organizationId: string) =>
  queryOptions({
    queryKey: customSkillKeys.all(organizationId),
    queryFn: ({ signal }): Promise<CustomSkill[]> =>
      collectAllPages<CustomSkill>(
        (cursor, pageSignal) =>
          callEndpoint(listCustomSkillsEndpoint, {
            query: { organizationId, ...pageQuery(cursor, COLLECT_PAGE_LIMIT) },
            signal: pageSignal,
          }),
        signal,
      ),
  });

export const useCustomSkills = (organizationId: string, options: { enabled?: boolean } = {}) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    ...customSkillsQuery(callEndpoint, organizationId),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
  });
};
