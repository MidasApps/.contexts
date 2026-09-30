import type { Organization, OrganizationId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/** `organizations` (SP1 spec §4); reads return live organizations only. */
export type OrganizationRepository = {
  readonly newId: () => OrganizationId;
  readonly get: (tx: Transaction | undefined, id: OrganizationId) => Promise<Organization | null>;
  readonly create: (tx: Transaction, args: { organization: Organization; actorId: string }) => void;
  readonly update: (tx: Transaction, args: { organization: Organization; actorId: string }) => void;
  readonly softDelete: (tx: Transaction, args: { id: OrganizationId; deletedAt: string; actorId: string }) => void;
};
