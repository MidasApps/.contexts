import type { TenantId } from "@core/contracts";
import type { GrantRecord } from "../../../domain/grant.ts";

export type { GrantRecord } from "../../../domain/grant.ts";

/** Reads memberships of one principal on a set of nodes (Firestore adapter in Task 9). */
export type GrantReader = {
  readonly listGrants: (args: {
    tenantId: TenantId;
    principalId: string;
    nodeIds: readonly string[];
  }) => Promise<readonly GrantRecord[]>;
};
