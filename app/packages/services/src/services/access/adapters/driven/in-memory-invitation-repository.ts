import { InvitationIdSchema, type Invitation } from "@core/contracts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { InvitationRepository } from "../../application/ports/driven/invitation-repository.ts";

type Row = { invitation: Invitation; tokenHash: string };

export type InMemoryInvitationRepository = InvitationRepository & {
  /** Inspection: the stored row, hash included. */
  readonly rowOf: (id: string) => Row | undefined;
};

// Newest first, like the Firestore query (`createdAt desc`, id desc).
const newestFirst = (left: Invitation, right: Invitation): number =>
  left.createdAt === right.createdAt ? (left.id < right.id ? 1 : -1) : left.createdAt < right.createdAt ? 1 : -1;

const isAfter = (invitation: Invitation, after: readonly [string, string]): boolean =>
  invitation.createdAt === after[0] ? invitation.id < after[1] : invitation.createdAt < after[0];

/** In-memory `InvitationRepository` for unit tests; transactions are ignored. */
export const createInMemoryInvitationRepository = (): InMemoryInvitationRepository => {
  const rows = new Map<string, Row>();
  let sequence = 0;
  return {
    newId: () => InvitationIdSchema.parse(`invitation-${(sequence += 1)}`),
    get: (_tx, id) => Promise.resolve(rows.get(id)?.invitation ?? null),
    findByTokenHash: (tokenHash) => Promise.resolve([...rows.values()].find((row) => row.tokenHash === tokenHash)?.invitation ?? null),
    list: ({ tenantId, statuses, page }) => {
      const matching = [...rows.values()]
        .map((row) => row.invitation)
        .filter((invitation) => invitation.tenantId === tenantId && (statuses === undefined || statuses.includes(invitation.status)))
        .sort(newestFirst)
        .filter((invitation) => page.after === undefined || isAfter(invitation, page.after));
      return Promise.resolve(pageFromOverfetch({ fetched: matching.slice(0, page.limit + 1), limit: page.limit, positionOf: (i) => [i.createdAt, i.id] }));
    },
    create: (_tx, { invitation, tokenHash }) => void rows.set(invitation.id, { invitation, tokenHash }),
    setStatus: (_tx, { id, status, acceptedByUid, updatedAt }) => {
      const row = rows.get(id);
      if (row !== undefined) row.invitation = { ...row.invitation, status, updatedAt, ...(acceptedByUid === undefined ? {} : { acceptedByUid }) };
    },
    rowOf: (id) => rows.get(id),
  };
};
