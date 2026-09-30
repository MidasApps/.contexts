import type { Role, RoleId, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** Custom roles (`roles`, SP1 spec §4). Reads return live roles only; escalation checks read records through `RoleReader`. */
export type RoleRepository = {
  readonly newId: () => RoleId;
  readonly get: (tx: Transaction | undefined, id: RoleId) => Promise<Role | null>;
  /** Live roles of a tenant, sorted by `(name, id)`. */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Role>>;
  readonly create: (tx: Transaction, args: { role: Role; actorId: string }) => void;
  readonly update: (tx: Transaction, args: { role: Role; actorId: string }) => void;
  readonly softDelete: (tx: Transaction, args: { id: RoleId; deletedAt: string; actorId: string }) => void;
};
