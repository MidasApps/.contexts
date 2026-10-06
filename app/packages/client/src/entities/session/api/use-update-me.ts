"use client";

import { type Me, type UpdateMeInput, updateMeEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { queryKeys } from "#/shared/api/query-keys.ts";

/**
 * `PATCH /v1/me` (shared by the update-profile and update-preferences features) that writes the answer into the `me` cache entry (read-your-writes for the
 * header, user menu and every profile page).
 */
export const useUpdateMe = (): ((input: UpdateMeInput) => Promise<Me>) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return useCallback(
    async (input: UpdateMeInput) => {
      const me = (await callEndpoint(updateMeEndpoint, { body: input })).data;
      queryClient.setQueryData(queryKeys.me(), me);
      return me;
    },
    [callEndpoint, queryClient],
  );
};
