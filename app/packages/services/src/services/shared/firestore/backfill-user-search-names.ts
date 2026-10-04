import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "./collections.ts";
import { USER_SEARCH_NAME_FIELD, userSearchFields } from "./user-search-fields.ts";

export type BackfillUserSearchNamesResult = {
  readonly scanned: number;
  readonly updated: number;
  /** Id of the last document read; pass it as `startAfter` to resume a run that stopped. */
  readonly lastId: string | null;
};

const searchNameOf = (doc: QueryDocumentSnapshot): string => {
  const displayName: unknown = doc.get("displayName");
  return userSearchFields(typeof displayName === "string" ? displayName : "").searchName;
};

/**
 * Backfill of `users.searchName` (decision 0044, migration phase "migrate"): walks `users` by
 * document id in batches and writes the field where it is missing or stale.
 * - Idempotent: a doc whose field is already right is not written, so a second run updates 0.
 * - Resumable: `startAfter` continues after an id; `onBatch` reports the checkpoint of each batch.
 * - Only `searchName` is written (`update` of one field): `updatedAt`/`updatedBy` stay, because the
 *   profile did not change. A name changed between a batch's read and its write is corrected by
 *   the next run (the comparison sees it as stale); a doc deleted in between fails the batch, and the
 *   run resumes from the last checkpoint.
 */
export const backfillUserSearchNames = async (args: {
  readonly firestore: Firestore;
  readonly batchSize?: number;
  readonly startAfter?: string;
  readonly dryRun?: boolean;
  readonly onBatch?: (progress: BackfillUserSearchNamesResult) => void;
}): Promise<BackfillUserSearchNamesResult> => {
  const size = Math.min(400, Math.max(1, args.batchSize ?? 200));
  const users = args.firestore.collection(CORE_COLLECTIONS.users);
  let progress: BackfillUserSearchNamesResult = { scanned: 0, updated: 0, lastId: args.startAfter ?? null };
  for (;;) {
    let query = users.orderBy(FieldPath.documentId()).limit(size);
    if (progress.lastId !== null) query = query.startAfter(progress.lastId);
    const snapshot = await query.get();
    if (snapshot.empty) return progress;
    const stale = snapshot.docs.filter((doc) => doc.get(USER_SEARCH_NAME_FIELD) !== searchNameOf(doc));
    if (args.dryRun !== true && stale.length > 0) {
      const batch = args.firestore.batch();
      for (const doc of stale) batch.update(doc.ref, { [USER_SEARCH_NAME_FIELD]: searchNameOf(doc) });
      await batch.commit();
    }
    progress = {
      scanned: progress.scanned + snapshot.size,
      updated: progress.updated + stale.length,
      lastId: snapshot.docs.at(-1)?.id ?? progress.lastId,
    };
    args.onBatch?.(progress);
    if (snapshot.size < size) return progress;
  }
};
