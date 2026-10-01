"use client";

import { useCallback, useMemo } from "react";
import { useMembers } from "#/entities/member/index.ts";

/**
 * Names of the people who started runs: the member's name (or e-mail) when the viewer may list
 * members (`core.member.read`) and the member is among the loaded ones, else `undefined` (the
 * timeline then shows the user id, as before). Found in the e2e: runs showed raw user ids.
 */
export const useStarterNames = (args: { organizationId: string; canReadMembers: boolean }) => {
  const members = useMembers(args.canReadMembers ? args.organizationId : undefined);
  const names = useMemo(
    () => new Map<string, string>((members.data ?? []).map((member) => [member.uid, member.displayName.trim() === "" ? member.email : member.displayName])),
    [members.data],
  );
  return useCallback((uid: string | null): string | undefined => (uid === null ? undefined : names.get(uid)), [names]);
};
