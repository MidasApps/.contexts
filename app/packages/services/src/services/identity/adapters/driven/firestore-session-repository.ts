import { SessionIdSchema } from "@core/contracts";
import { FieldPath, type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { SessionRepository } from "../../application/ports/driven/session-repository.ts";
import { type SessionRecord, SessionRecordSchema } from "../../domain/session-record.schema.ts";

const contract = { schema: SessionRecordSchema };
const converter = createContractConverter(contract);
const BATCH_SIZE = 400;

/**
 * Firestore `SessionRepository` over `sessions` (server-only; Security Rules deny it).
 * The documents hold the record plus `schemaVersion` and audit actor fields.
 */
export const createFirestoreSessionRepository = (deps: { firestore: Firestore }): SessionRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.sessions);
  const typed = () => raw().withConverter(converter);
  const first = async (field: string, op: "==" | "array-contains", value: string): Promise<SessionRecord | null> =>
    (await typed().where(field, op, value).limit(1).get()).docs[0]?.data() ?? null;
  const update = (patch: Record<string, unknown>) => toFirestoreUpdate(contract, patch);
  return {
    newId: () => SessionIdSchema.parse(raw().doc().id),
    create: async (record) => {
      await raw()
        .doc(record.id)
        .create({
          ...converter.toFirestore(record),
          createdBy: record.uid,
          updatedBy: record.uid,
          schemaVersion: CORE_SCHEMA_VERSION,
        });
    },
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    findByCookieHash: (hash) => first("cookieHash", "==", hash),
    findBySecretHash: (hash) => first("secretHash", "==", hash),
    findByPreviousSecretHash: (hash) => first("previousSecretHashes", "array-contains", hash),
    listOpen: async ({ uid, page }) => {
      let query = typed()
        .where("uid", "==", uid)
        .where("revokedAt", "==", null)
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined)
        query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({
        fetched,
        limit: page.limit,
        positionOf: (record: SessionRecord) => [record.createdAt, record.id],
      });
    },
    touch: async ({ id, lastSeenAt }) => {
      await raw().doc(id).update(update({ lastSeenAt }));
    },
    setImpersonation: async ({ id, impersonationSessionId }) => {
      await raw().doc(id).update(update({ impersonationSessionId }));
    },
    rotate: (tx, { id, ...patch }) =>
      void tx.update(raw().doc(id), update({ ...patch, previousSecretHashes: [...patch.previousSecretHashes] })),
    revoke: async (tx, { id, revokedAt }) => {
      const ref = raw().doc(id);
      if (tx === undefined) await ref.update(update({ revokedAt }));
      else tx.update(ref, update({ revokedAt }));
    },
    revokeAllOf: async ({ uid, revokedAt }) => {
      let closed = 0;
      for (;;) {
        const open = await raw().where("uid", "==", uid).where("revokedAt", "==", null).limit(BATCH_SIZE).get();
        if (open.empty) return closed;
        const batch = deps.firestore.batch();
        for (const doc of open.docs) batch.update(doc.ref, update({ revokedAt }));
        await batch.commit();
        closed += open.size;
      }
    },
  };
};
