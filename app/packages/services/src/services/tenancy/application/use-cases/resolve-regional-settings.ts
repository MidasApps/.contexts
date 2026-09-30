import type { Organization, Project, RegionalSettings, TenantNodeRef, Unit, UserPreferences } from "@core/contracts";
import { resolveRegionalSettings } from "../../domain/regional-settings.ts";
import type { TenancyDeps } from "../tenancy-deps.ts";

/** A live node with its chain: the organization, the project and the unit path (root first, the unit last). */
export type NodeDetails = {
  readonly organization: Organization;
  readonly project?: Project;
  readonly unit?: Unit;
  readonly units: readonly Unit[];
};

/**
 * Loads a node and its chain without authorizing it (callers authorize first).
 * @returns null when a node of the chain is missing, deleted or of another tenant.
 */
export type LoadNode = (node: TenantNodeRef) => Promise<NodeDetails | null>;

export const makeLoadNode =
  (deps: Pick<TenancyDeps, "organizations" | "projects" | "units">): LoadNode =>
  async (node) => {
    const organization = await deps.organizations.get(undefined, node.tenantId);
    if (organization === null) return null;
    if (node.level === "organization") return { organization, units: [] };
    const project = await deps.projects.get(undefined, node.projectId);
    if (project?.tenantId !== node.tenantId) return null;
    if (node.level === "project") return { organization, project, units: [] };
    const unit = await deps.units.get(undefined, node.unitId);
    if (unit?.projectId !== project.id) return null;
    const ancestors = await deps.units.getMany(unit.ancestorIds);
    const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
    const chain = unit.ancestorIds.map((id) => byId.get(id));
    if (chain.some((ancestor) => ancestor === undefined)) return null;
    return { organization, project, unit, units: [...chain.filter((ancestor) => ancestor !== undefined), unit] };
  };

type Preferences = Pick<UserPreferences, "locale" | "timeZone" | "currency">;

/** Regional settings of a user at a loaded node (SP1 spec §4). Pure. */
export const regionalSettingsAt = (details: NodeDetails, preferences?: Preferences): RegionalSettings =>
  resolveRegionalSettings({ organization: details.organization, project: details.project, units: details.units, user: preferences });

export type ResolveNodeRegionalSettings = (args: { node: TenantNodeRef; preferences?: Preferences | undefined }) => Promise<RegionalSettings | null>;

/**
 * Loads the node chain (organization, project, unit ancestors, unit) and resolves the
 * regional settings for a user there (SP1 spec §4). Callers authorize the node first
 * (`resolveAccessContext`, SP1 Task 12).
 * @returns null when a node of the chain is missing or deleted.
 */
export const makeResolveNodeRegionalSettings =
  (deps: Pick<TenancyDeps, "organizations" | "projects" | "units">): ResolveNodeRegionalSettings => {
    const loadNode = makeLoadNode(deps);
    return async ({ node, preferences }) => {
      const details = await loadNode(node);
      return details === null ? null : regionalSettingsAt(details, preferences);
    };
  };
