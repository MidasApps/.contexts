import { queryKeys, type QueryKey } from "#/shared/api/query-keys.ts";

/** Unit query keys under the organization; unit types are a platform catalog (`["catalog", …]`). */
export const unitKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "units"),
  children: (organizationId: string, projectId: string, parentUnitId: string | undefined): QueryKey =>
    queryKeys.organizationScoped(organizationId, "units", "children", projectId, parentUnitId ?? null),
  tree: (organizationId: string, projectId: string): QueryKey => queryKeys.organizationScoped(organizationId, "units", "tree", projectId),
  detail: (organizationId: string, unitId: string): QueryKey => queryKeys.organizationScoped(organizationId, "units", "detail", unitId),
  types: (): QueryKey => ["catalog", "unit-types"],
};
