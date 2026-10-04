import { ImpersonationSessionIdSchema, ImpersonationSessionSchema, PlatformStaffSchema } from "@core/contracts";
import {
  type DocumentReference,
  FieldPath,
  type Firestore,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { createContractConverter } from "#/services/shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type { ImpersonationSessionRepository } from "../../application/ports/driven/impersonation-session-repository.ts";
import type { PlatformStaffRepository } from "../../application/ports/driven/platform-staff-repository.ts";

// The uid is the document id and also a stored field, so the doc parses with the entity contract.
const staffConverter = createContractConverter({ schema: PlatformStaffSchema });
const sessionConverter = createContractConverter({ schema: ImpersonationSessionSchema });

const readDoc = async <T>(tx: Transaction | undefined, ref: DocumentReference<T>): Promise<T | null> =>
  (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;

/** Firestore `PlatformStaffRepository` over `platform-staff/{uid}` (server-only; Rules deny it). */
export const createFirestorePlatformStaffRepository = (deps: { firestore: Firestore }): PlatformStaffRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.platformStaff);
  return {
    get: (tx, uid) => readDoc(tx, raw().withConverter(staffConverter).doc(uid)),
    // `createdBy` is written with the first grant only: merge keeps it afterwards.
    put: (tx, { staff, actorId }) =>
      void tx.set(
        raw().doc(staff.uid),
        {
          ...staffConverter.toFirestore(staff),
          ...(staff.createdAt === staff.updatedAt ? { createdBy: actorId } : {}),
          updatedBy: actorId,
          schemaVersion: CORE_SCHEMA_VERSION,
        },
        { merge: true },
      ),
  };
};

/** Firestore `ImpersonationSessionRepository` over `impersonation-sessions` (server-only). */
export const createFirestoreImpersonationSessionRepository = (deps: {
  firestore: Firestore;
}): ImpersonationSessionRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.impersonationSessions);
  return {
    newId: () => ImpersonationSessionIdSchema.parse(raw().doc().id),
    create: (tx, { session, actorId }) =>
      void tx.create(raw().doc(session.id), {
        ...sessionConverter.toFirestore(session),
        updatedAt: Timestamp.fromDate(new Date(session.createdAt)),
        createdBy: actorId,
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    get: (tx, id) => readDoc(tx, raw().withConverter(sessionConverter).doc(id)),
    end: (tx, { id, endedAt, actorId }) => {
      const at = Timestamp.fromDate(new Date(endedAt));
      tx.update(raw().doc(id), { endedAt: at, updatedAt: at, updatedBy: actorId });
    },
    // One field plus the document id in the same direction: the automatic single-field index serves it.
    listRecent: async ({ after, limit }) => {
      let query = raw()
        .withConverter(sessionConverter)
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc")
        .limit(limit + 1);
      if (after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(after[0])), after[1]);
      const snapshot = await query.get();
      return pageFromOverfetch({
        fetched: snapshot.docs.map((doc) => doc.data()),
        limit,
        positionOf: (session) => [session.createdAt, session.id],
      });
    },
    // A range on `expiresAt` alone (no composite index); the few ended ones among them are dropped here.
    listOpen: async ({ now, limit }) => {
      const snapshot = await raw()
        .withConverter(sessionConverter)
        .where("expiresAt", ">", Timestamp.fromDate(now))
        .orderBy("expiresAt")
        .limit(limit)
        .get();
      return snapshot.docs.map((doc) => doc.data()).filter((session) => session.endedAt === null);
    },
  };
};
