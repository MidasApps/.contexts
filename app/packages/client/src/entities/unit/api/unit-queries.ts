"use client";

import { getUnitEndpoint, listUnitsEndpoint, listUnitTypesEndpoint, MAX_UNIT_DEPTH, type Unit, type UnitTypeDefinition } from "@core/contracts";
import { queryOptions, useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { COLLECT_PAGE_LIMIT, collectAllPages, nullOnNotFound, pageQuery } from "#/shared/api/cursor-list.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";
import { unitKeys } from "./unit-keys.ts";

type ProjectNode = { organizationId: string; projectId: string };

/** The unit picker reads at most this many units (SP1 moves subtrees of up to 500 units). */
export const MAX_TREE_UNITS = 500;

const EMPTY_NODE: ProjectNode = { organizationId: "", projectId: "" };

const listChildren = (callEndpoint: CallEndpoint, projectId: string, parentUnitId: string | undefined, signal: AbortSignal): Promise<Unit[]> =>
  collectAllPages(
    (cursor, pageSignal) =>
      callEndpoint(listUnitsEndpoint, {
        params: { projectId },
        query: { ...pageQuery(cursor, COLLECT_PAGE_LIMIT), ...(parentUnitId === undefined ? {} : { parentUnitId }) },
        signal: pageSignal,
      }),
    signal,
  );

/** Every visible unit of a project, level by level (depth ≤ 6), capped at `MAX_TREE_UNITS`. */
export const fetchUnitTree = async (callEndpoint: CallEndpoint, projectId: string, signal: AbortSignal): Promise<Unit[]> => {
  const units: Unit[] = [];
  let parents: (string | undefined)[] = [undefined];
  for (let depth = 0; depth <= MAX_UNIT_DEPTH && parents.length > 0 && units.length < MAX_TREE_UNITS; depth += 1) {
    const level = (await Promise.all(parents.map((parent) => listChildren(callEndpoint, projectId, parent, signal)))).flat();
    units.push(...level);
    parents = level.map((unit) => unit.id);
  }
  return units.slice(0, MAX_TREE_UNITS);
};

/** Direct children of the project (or of `parentUnitId`), every page. */
export const unitsQuery = (callEndpoint: CallEndpoint, node: ProjectNode & { parentUnitId?: string | undefined }) =>
  queryOptions({
    queryKey: unitKeys.children(node.organizationId, node.projectId, node.parentUnitId),
    queryFn: ({ signal }) => listChildren(callEndpoint, node.projectId, node.parentUnitId, signal),
  });

/** The whole unit tree of a project as a flat list (nest it with `buildUnitTree`). */
export const unitTreeQuery = (callEndpoint: CallEndpoint, node: ProjectNode) =>
  queryOptions({
    queryKey: unitKeys.tree(node.organizationId, node.projectId),
    queryFn: ({ signal }) => fetchUnitTree(callEndpoint, node.projectId, signal),
  });

/** `GET /v1/units/{id}`; `null` when not visible (404). */
export const unitQuery = (callEndpoint: CallEndpoint, node: { organizationId: string; unitId: string }) =>
  queryOptions({
    queryKey: unitKeys.detail(node.organizationId, node.unitId),
    queryFn: ({ signal }): Promise<Unit | null> =>
      nullOnNotFound(async () => (await callEndpoint(getUnitEndpoint, { params: { unitId: node.unitId }, signal })).data),
  });

/** Unit types registered by the installed modules (platform catalog, every page, 5 min fresh). */
export const unitTypesQuery = (callEndpoint: CallEndpoint) =>
  queryOptions({
    queryKey: unitKeys.types(),
    queryFn: ({ signal }): Promise<UnitTypeDefinition[]> =>
      collectAllPages((cursor, pageSignal) => callEndpoint(listUnitTypesEndpoint, { query: pageQuery(cursor, COLLECT_PAGE_LIMIT), signal: pageSignal }), signal),
    staleTime: 5 * 60_000,
  });

const useProjectEnabled = (node: ProjectNode | null): boolean => {
  const signedIn = useIsSignedIn();
  return signedIn && node !== null && node.organizationId !== "" && node.projectId !== "";
};

/** Direct children of a project or unit. */
export const useUnits = (node: (ProjectNode & { parentUnitId?: string | undefined }) | null): UseQueryResult<Unit[]> => {
  const callEndpoint = useCallEndpoint();
  const enabled = useProjectEnabled(node);
  return useQuery({ ...unitsQuery(callEndpoint, node ?? EMPTY_NODE), enabled });
};

/** The project's unit tree (flat list); disabled without a project. */
export const useUnitTree = (node: ProjectNode | null): UseQueryResult<Unit[]> => {
  const callEndpoint = useCallEndpoint();
  const enabled = useProjectEnabled(node);
  return useQuery({ ...unitTreeQuery(callEndpoint, node ?? EMPTY_NODE), enabled });
};

/** The registered unit types (labels for pickers and forms). */
export const useUnitTypes = (): UseQueryResult<UnitTypeDefinition[]> => {
  const callEndpoint = useCallEndpoint();
  return useQuery({ ...unitTypesQuery(callEndpoint), enabled: useIsSignedIn() });
};

/** A unit segment of a path: id and name (`null` while loading or when not visible). */
export type UnitPathSegment = { readonly id: string; readonly name: string | null };

/**
 * Names of a unit's ancestors followed by the unit itself (breadcrumbs), one cached `GET` per
 * ancestor. Hidden ancestors keep `name: null` (the caller shows a placeholder).
 */
export const useUnitPath = (
  organizationId: string | undefined,
  unit: Pick<Unit, "id" | "name" | "ancestorIds"> | undefined,
): readonly UnitPathSegment[] => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  const ancestors = useQueries({
    queries: (unit?.ancestorIds ?? []).map((unitId) => ({
      ...unitQuery(callEndpoint, { organizationId: organizationId ?? "", unitId }),
      enabled: signedIn && organizationId !== undefined,
    })),
  });
  if (unit === undefined) return [];
  const names = ancestors.map((query, index): UnitPathSegment => ({ id: unit.ancestorIds[index] ?? String(index), name: query.data?.name ?? null }));
  return [...names, { id: unit.id, name: unit.name }];
};
