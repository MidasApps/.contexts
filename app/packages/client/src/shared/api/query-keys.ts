/** A query key: plain JSON parts, most general first (TanStack Query prefix matching). */
export type QueryKey = readonly unknown[];

/**
 * Query keys of the core (decision 0011): tenant data lives under `["organizations", id]`, so
 * switching or leaving an organization invalidates everything it owns with one prefix;
 * user-level data lives under `["me"]`.
 */
export const queryKeys = {
  me: (): QueryKey => ["me"],
  myOrganizations: (query: Record<string, unknown> = {}): QueryKey => ["me", "organizations", query],
  organization: (organizationId: string): QueryKey => ["organizations", organizationId],
  accessContext: (node: {
    organizationId: string;
    projectId?: string | undefined;
    unitId?: string | undefined;
  }): QueryKey => ["organizations", node.organizationId, "access-context", node.projectId ?? null, node.unitId ?? null],
  /** Any other tenant resource: `["organizations", id, resource, ...parts]`. */
  organizationScoped: (organizationId: string, resource: string, ...parts: readonly unknown[]): QueryKey => [
    "organizations",
    organizationId,
    resource,
    ...parts,
  ],
} as const;
