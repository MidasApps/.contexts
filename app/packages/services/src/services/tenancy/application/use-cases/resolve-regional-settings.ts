import type { RegionalSettings, TenantNodeRef, UserPreferences } from "@core/contracts";
import { resolveRegionalSettings } from "../../domain/regional-settings.ts";
import type { TenancyDeps } from "../tenancy-deps.ts";

export type ResolveNodeRegionalSettings = (args: {
  node: TenantNodeRef;
  preferences?: Pick<UserPreferences, "locale" | "timeZone" | "currency"> | undefined;
}) => Promise<RegionalSettings | null>;

/**
 * Loads the node chain (organization, project, unit ancestors, unit) and resolves the
 * regional settings for a user there (SP1 spec §4). Callers authorize the node first
 * (`resolveAccessContext`, SP1 Task 12).
 * @returns null when a node of the chain is missing or deleted.
 */
export const makeResolveNodeRegionalSettings =
  (deps: Pick<TenancyDeps, "organizations" | "projects" | "units">): ResolveNodeRegionalSettings =>
  async ({ node, preferences }) => {
    const organization = await deps.organizations.get(undefined, node.tenantId);
    if (organization === null) return null;
    if (node.level === "organization") return resolveRegionalSettings({ organization, user: preferences });
    const project = await deps.projects.get(undefined, node.projectId);
    if (project?.tenantId !== node.tenantId) return null;
    if (node.level === "project") return resolveRegionalSettings({ organization, project, user: preferences });
    const unit = await deps.units.get(undefined, node.unitId);
    if (unit?.projectId !== project.id) return null;
    const ancestors = await deps.units.getMany(unit.ancestorIds);
    const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    const chain = unit.ancestorIds.map((id) => byId.get(id));
    if (chain.some((ancestor) => ancestor === undefined)) return null;
    const units = [...chain.filter((ancestor) => ancestor !== undefined), unit];
    return resolveRegionalSettings({ organization, project, units, user: preferences });
  };
