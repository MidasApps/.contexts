import type { Route } from "#/shared/lib/router/route-paths.ts";

/**
 * The current project or module route with `?unit=` set (or removed with `undefined`), from the
 * router's params; `null` outside a project. The page (module sub-path, chat conversation) stays
 * the same; `routeId` tells the chat from the project home, which share their params.
 */
export const withUnit = (params: Readonly<Record<string, string | undefined>>, unit: string | undefined, routeId?: Route["id"]): Route | null => {
  const { organizationId, projectId, moduleId, rest, conversationId } = params;
  if (organizationId === undefined || projectId === undefined || projectId === "") return null;
  if (moduleId !== undefined && moduleId !== "") return { id: "module", organizationId, projectId, moduleId, rest: rest ?? "", unit };
  if (routeId === "chat") return { id: "chat", organizationId, projectId, conversationId, unit };
  return { id: "project", organizationId, projectId, unit };
};
