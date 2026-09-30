import { InvitationIdSchema, InvitationSchema, type Invitation } from "@core/contracts";
import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { InvitationRepository } from "../../application/ports/driven/invitation-repository.ts";

// Reads parse with the wire contract, which has no `tokenHash`: the hash never leaves this adapter.
const converter = createContractConverter({ schema: InvitationSchema });

/**
 * Firestore `InvitationRepository` over the top-level `invitations` collection. The
 * document holds the contract fields plus `tokenHash`, audit fields and `schemaVersion`.
 */
export const createFirestoreInvitationRepository = (deps: { firestore: Firestore }): InvitationRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.invitations);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => InvitationIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    findByTokenHash: async (tokenHash) => {
      const snapshot = await typed().where("tokenHash", "==", tokenHash).limit(1).get();
      return snapshot.docs[0]?.data() ?? null;
    },
    list: async ({ tenantId, statuses, page }) => {
      let query = typed().where("tenantId", "==", tenantId);
      if (statuses !== undefined) query = query.where("status", "in", [...statuses]);
      query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (invitation: Invitation) => [invitation.createdAt, invitation.id] });
    },
    create: (tx, { invitation, tokenHash, actorId }) =>
      void tx.create(raw().doc(invitation.id), {
        ...converter.toFirestore(invitation),
        tokenHash,
        createdBy: actorId,
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    setStatus: (tx, { id, status, acceptedByUid, updatedAt, actorId }) =>
      void tx.update(
        raw().doc(id),
        toFirestoreUpdate({ schema: InvitationSchema }, { status, ...(acceptedByUid === undefined ? {} : { acceptedByUid }), updatedAt, updatedBy: actorId }),
      ),
  };
};
