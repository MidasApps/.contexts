"use client";

import { useCallback, useMemo } from "react";
import { useMembers } from "../api/member-queries.ts";

/**
 * Names of members by uid: the member's name (or e-mail) when the viewer may list members
 * (`core.member.read`) and the member is among the loaded ones, else `undefined` (the caller then
 * shows the user id). Used by workflow runs (who started them) and the usage page (who spent).
 */
export const useMemberNames = (args: { organizationId: string; canReadMembers: boolean }) => {
  const members = useMembers(args.canReadMembers ? args.organizationId : undefined);
  const names = useMemo(
    () =>
      new Map<string, string>(
        (members.data ?? []).map((member) => [
          member.uid,
          member.displayName.trim() === "" ? member.email : member.displayName,
        ]),
      ),
    [members.data],
  );
  return useCallback((uid: string | null): string | undefined => (uid === null ? undefined : names.get(uid)), [names]);
};
