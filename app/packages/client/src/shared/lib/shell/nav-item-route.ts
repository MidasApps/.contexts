import type { Route } from "#/shared/lib/router/route-paths.ts";
import type { NavTarget } from "./shell-types.ts";

/** The current place in the tree, from the URL (`/o/:organizationId/p/:projectId?unit=`). */
export type NavContext = { organizationId?: string | undefined; projectId?: string | undefined; unitId?: string | undefined };

/**
 * The route a navigation target leads to from the current context, or `null` when the context
 * lacks the organization or project it needs (the item is then not rendered).
 */
export const navItemRoute = (target: NavTarget, context: NavContext): Route | null => {
  const { organizationId, projectId, unitId } = context;
  switch (target.kind) {
    case "profile":
      return { id: "profile", section: target.section };
    case "admin":
      return { id: "admin", rest: target.rest };
    case "organization-home":
      return organizationId === undefined ? null : { id: "organization", organizationId };
    case "settings":
      return organizationId === undefined ? null : { id: "settings", organizationId, section: target.section };
    case "settings-module":
      return organizationId === undefined ? null : { id: "settings-module", organizationId, moduleId: target.moduleId };
    case "project-home":
      return organizationId === undefined || projectId === undefined ? null : { id: "project", organizationId, projectId, unit: unitId };
    case "module":
      return organizationId === undefined || projectId === undefined
        ? null
        : { id: "module", organizationId, projectId, moduleId: target.moduleId, rest: target.path, unit: unitId };
  }
};
