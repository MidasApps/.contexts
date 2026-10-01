import type { Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";

const PAGE = 500;

/**
 * Ids of every live organization (`deletedAt == null`), for platform jobs that visit each tenant
 * (SP5 `usage-report`). Reads ids only (`select()`), in pages ordered by document id. A system read:
 * the callers are platform workflows, never a request.
 */
export const listLiveOrganizationIds = async (firestore: Firestore): Promise<string[]> => {
  const ids: string[] = [];
  let last: string | undefined;
  for (;;) {
    let query = firestore.collection(CORE_COLLECTIONS.organizations).where("deletedAt", "==", null).orderBy("__name__").select().limit(PAGE);
    if (last !== undefined) query = query.startAfter(last);
    const snapshot = await query.get();
    ids.push(...snapshot.docs.map((doc) => doc.id));
    last = snapshot.docs.at(-1)?.id;
    if (snapshot.size < PAGE) return ids;
  }
};
