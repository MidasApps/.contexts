import { type AdminUserSummary, AdminUserSummarySchema } from "@core/contracts";
import { type DocumentSnapshot, FieldPath, type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { USER_SEARCH_NAME_FIELD } from "../../../shared/firestore/user-search-fields.ts";
import { pageFromOverfetch, type Page, type PageRequest } from "../../../shared/pagination/page.ts";
import type { AdminUserDirectory } from "../../application/ports/admin-user-directory.ts";

// The last code point Firestore orders, so `[prefix, prefix + END)` is every value with the prefix.
const PREFIX_END = "";

type Row = { readonly user: AdminUserSummary; readonly sortValue: string };

// Lenient on purpose: a users doc another writer left partial (no email yet) is still listed;
// one that cannot fit the view at all is skipped, never a 500.
const rowOf = (snapshot: DocumentSnapshot, sortField: string): Row | null => {
  const data = snapshot.data();
  if (data === undefined) return null;
  const createdAt: unknown = data["createdAt"];
  const parsed = AdminUserSummarySchema.safeParse({
    id: snapshot.id,
    email: typeof data["email"] === "string" ? data["email"] : null,
    displayName: typeof data["displayName"] === "string" ? data["displayName"] : "",
    status: data["status"] === "disabled" ? "disabled" : "active",
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : null,
  });
  const sortValue: unknown = data[sortField];
  return parsed.success ? { user: parsed.data, sortValue: typeof sortValue === "string" ? sortValue : "" } : null;
};

/**
 * Firestore `AdminUserDirectory` over `users/{uid}` (decision 0044). Each prefix search is one
 * range on one field (`email`, or the storage-only `searchName`) ordered by that field and the
 * document id, which the automatic single-field indexes serve. `getMany` is one `getAll`.
 */
export const createFirestoreAdminUserDirectory = (deps: { readonly firestore: Firestore }): AdminUserDirectory => {
  const users = () => deps.firestore.collection(CORE_COLLECTIONS.users);
  const byPrefix = async (field: string, { prefix, page }: { prefix: string; page: PageRequest }): Promise<Page<AdminUserSummary>> => {
    let query = users()
      .where(field, ">=", prefix)
      .where(field, "<", `${prefix}${PREFIX_END}`)
      .orderBy(field)
      .orderBy(FieldPath.documentId())
      .limit(page.limit + 1);
    if (page.after !== undefined) query = query.startAfter(page.after[0], page.after[1]);
    const rows = (await query.get()).docs.map((doc) => rowOf(doc, field)).filter((row): row is Row => row !== null);
    const listed = pageFromOverfetch({ fetched: rows, limit: page.limit, positionOf: (row) => [row.sortValue, row.user.id] });
    return { items: listed.items.map((row) => row.user), nextCursor: listed.nextCursor };
  };
  return {
    searchByName: (args) => byPrefix(USER_SEARCH_NAME_FIELD, args),
    searchByEmail: (args) => byPrefix("email", args),
    getMany: async (ids) => {
      if (ids.length === 0) return [];
      const snapshots = await deps.firestore.getAll(...ids.map((id) => users().doc(id)));
      return snapshots.flatMap((snapshot) => rowOf(snapshot, "email")?.user ?? []);
    },
  };
};
