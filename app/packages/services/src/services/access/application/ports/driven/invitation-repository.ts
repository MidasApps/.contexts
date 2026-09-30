import type { Invitation, InvitationId, InvitationStatus, TenantId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { Page, PageRequest } from "../../../../shared/pagination/page.ts";

/**
 * `invitations` (SP1 spec §4, §6.2). The token hash is written on create and only
 * matched by `findByTokenHash`; no read returns it. Statuses are the stored ones
 * (`effectiveInvitationStatus` derives `expired`).
 */
export type InvitationRepository = {
  readonly newId: () => InvitationId;
  readonly get: (tx: Transaction | undefined, id: InvitationId) => Promise<Invitation | null>;
  readonly findByTokenHash: (tokenHash: string) => Promise<Invitation | null>;
  /** Newest first (`createdAt desc`, id desc); `statuses` filters the stored status. */
  readonly list: (args: { tenantId: TenantId; statuses?: readonly InvitationStatus[] | undefined; page: PageRequest }) => Promise<Page<Invitation>>;
  readonly create: (tx: Transaction, args: { invitation: Invitation; tokenHash: string; actorId: string }) => void;
  readonly setStatus: (
    tx: Transaction,
    args: { id: InvitationId; status: "accepted" | "revoked"; acceptedByUid?: UserId; updatedAt: string; actorId: string },
  ) => void;
};
