import type { Route } from "#/shared/lib/router/route-paths.ts";

/**
 * The current project or module route with `?unit=` set (or removed with `undefined`), from the
 * router's params; `null` outside a project. The page (and module sub-path) stays the same.
 */
export const withUnit = (params: Readonly<Record<string, string | undefined>>, unit: string | undefined): Route | null => {
  const { organizationId, projectId, moduleId, rest } = params;
  if (organizationId === undefined || projectId === undefined || projectId === "") return null;
  if (moduleId !== undefined && moduleId !== "") return { id: "module", organizationId, projectId, moduleId, rest: rest ?? "", unit };
  return { id: "project", organizationId, projectId, unit };
};
