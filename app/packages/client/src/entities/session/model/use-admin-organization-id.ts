"use client";

import { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
import { useMe } from "../api/use-me.ts";

/**
 * The organization the administration is about (decision 0077): the one in the URL
 * (`/admin/o/:organizationId/…`), else the last one the user worked in, so the profile and the
 * platform console still offer the way back to it. `undefined` while `/v1/me` loads or when the
 * user belongs to none.
 */
export const useAdminOrganizationId = (): string | undefined => {
  const node = useCurrentNode();
  const me = useMe();
  return node?.organizationId ?? me.data?.lastContext.organizationId;
};
