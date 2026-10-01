"use client";

import { createUnitEndpoint, deleteUnitEndpoint, updateUnitEndpoint, type Unit } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { unitKeys } from "#/entities/unit/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useIdempotencyKey } from "#/shared/api/use-idempotency-key.ts";

type ProjectRef = { organizationId: string; projectId: string };

/**
 * Unit writes of one project (SP1 spec §6.1): create (Idempotency-Key per attempt), rename, move
 * (`PATCH parentUnitId`) and delete (the subtree goes with it). Each refetches the unit caches of
 * the organization (trees, pickers, breadcrumbs). Failures throw `ApiError` for the dialogs.
 */
export const useUnitMutations = ({ organizationId, projectId }: ProjectRef) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: unitKeys.all(organizationId) }), [organizationId, queryClient]);
  const create = async (input: { name: string; type: string; parentUnitId: string | null }): Promise<Unit> => {
    const unit = (await callEndpoint(createUnitEndpoint, { params: { projectId }, body: input, idempotencyKey: idempotency.keyFor(input) })).data;
    idempotency.reset();
    await refresh();
    return unit;
  };
  const rename = async (unitId: string, name: string): Promise<void> => {
    await callEndpoint(updateUnitEndpoint, { params: { unitId }, body: { name } });
    await refresh();
  };
  const move = async (unitId: string, parentUnitId: string | null): Promise<void> => {
    await callEndpoint(updateUnitEndpoint, { params: { unitId }, body: { parentUnitId } });
    await refresh();
  };
  const remove = async (unitId: string): Promise<void> => {
    await callEndpoint(deleteUnitEndpoint, { params: { unitId } });
    await refresh();
  };
  return { create, rename, move, remove };
};
