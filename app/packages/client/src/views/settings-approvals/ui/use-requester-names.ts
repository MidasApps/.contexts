"use client";

import type { ApprovalRequest } from "@core/contracts";
import { useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";
import { useMembers } from "#/entities/member/index.ts";

/**
 * Names of requesters: "you" for the viewer, the member's name when the viewer may list members
 * (`core.member.read`) and the member is among the loaded ones, else `undefined` (the item then
 * shows the principal id; devices and API keys have no member entry).
 */
export const useRequesterNames = (args: {
  organizationId: string;
  viewerUid: string | null;
  canReadMembers: boolean;
}) => {
  const t = useTranslations("settings.approvals.requester");
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
  const you = t("you");
  const { viewerUid } = args;
  return useCallback(
    (request: Pick<ApprovalRequest, "requestedBy">): string | undefined =>
      request.requestedBy.id === viewerUid ? you : names.get(request.requestedBy.id),
    [names, viewerUid, you],
  );
};
