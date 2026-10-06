import type { Route } from "#/shared/lib/router/route-paths.ts";
import type { NavTarget } from "./shell-types.ts";

/** The current place in the tree, from the URL (`/o/:organizationId/p/:projectId?unit=`). */
export type NavContext = {
  organizationId?: string | undefined;
  projectId?: string | undefined;
  unitId?: string | undefined;
};

type OrganizationTarget = Extract<NavTarget, { kind: "organization-home" | "settings" | "settings-module" }>;
type ProjectTarget = Extract<NavTarget, { kind: "project-home" | "chat" | "module" }>;
type ProjectContext = { organizationId: string; projectId: string; unitId: string | undefined };

/** Targets that need only the organization. */
const organizationTargetRoute = (target: OrganizationTarget, organizationId: string): Route => {
  switch (target.kind) {
    case "organization-home":
      return { id: "organization", organizationId };
    case "settings":
      return { id: "settings", organizationId, section: target.section };
    case "settings-module":
      return { id: "settings-module", organizationId, moduleId: target.moduleId };
  }
};

/** Targets inside a project; they keep the unit the context is on. */
const projectTargetRoute = (target: ProjectTarget, { organizationId, projectId, unitId }: ProjectContext): Route => {
  switch (target.kind) {
    case "project-home":
      return { id: "project", organizationId, projectId, unit: unitId };
    case "chat":
      return { id: "chat", organizationId, projectId, unit: unitId };
    case "module":
      return { id: "module", organizationId, projectId, moduleId: target.moduleId, rest: target.path, unit: unitId };
  }
};

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
    case "settings":
    case "settings-module":
      return organizationId === undefined ? null : organizationTargetRoute(target, organizationId);
    case "project-home":
    case "chat":
    case "module":
      return organizationId === undefined || projectId === undefined
        ? null
        : projectTargetRoute(target, { organizationId, projectId, unitId });
  }
};
