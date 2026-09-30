import type { RoleId, TenantId } from "@core/contracts";
import type { CustomRoleRecord } from "../../../domain/grant.ts";

export type { CustomRoleRecord } from "../../../domain/grant.ts";

/** Reads custom roles by id; missing ids are simply absent from the result. */
export type RoleReader = {
  readonly getRoles: (args: { tenantId: TenantId; roleIds: readonly RoleId[] }) => Promise<readonly CustomRoleRecord[]>;
};
