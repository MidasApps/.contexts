"use client";

import type { NodeParams } from "#/shared/api/core-queries.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";

/**
 * The node the URL points at (decision 0012 §3: organization and project in the path, unit in
 * `?unit=`), or `null` outside an organization (profile, organizations list, sign-in).
 */
export const useCurrentNode = (): NodeParams | null => {
  const router = useRouter();
  const { organizationId, projectId } = router.useRouteParams();
  const unitId = router.useSearchParam("unit") ?? undefined;
  if (organizationId === undefined || organizationId === "") return null;
  const project = projectId === "" ? undefined : projectId;
  return { organizationId, projectId: project, unitId: project === undefined || unitId === "" ? undefined : unitId };
};
