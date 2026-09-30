import type { Project, ProjectId, TenantId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/** `projects` (SP1 spec §4); reads return live projects only. */
export type ProjectRepository = {
  readonly newId: () => ProjectId;
  readonly get: (tx: Transaction | undefined, id: ProjectId) => Promise<Project | null>;
  /** Live projects of the tenant among `ids` (visible-project lists), in no order. */
  readonly getMany: (args: { tenantId: TenantId; ids: readonly ProjectId[] }) => Promise<Project[]>;
  /** Live projects of a tenant, sorted by `(name, id)`. */
  readonly list: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Project>>;
  readonly create: (tx: Transaction, args: { project: Project; actorId: string }) => void;
  readonly update: (tx: Transaction, args: { project: Project; actorId: string }) => void;
  readonly softDelete: (tx: Transaction, args: { id: ProjectId; deletedAt: string; actorId: string }) => void;
};
