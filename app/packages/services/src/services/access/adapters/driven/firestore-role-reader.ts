import type { Firestore } from "firebase-admin/firestore";
import type { RoleReader } from "../../application/ports/driven/role-reader.ts";
import { roleCollectionOf, storedRoleConverter } from "./firestore-role-repository.ts";

/**
 * Firestore `RoleReader` for `authorize()`: every named role, deleted ones included
 * (`authorize()` ignores them), in parallel.
 */
export const createFirestoreRoleReader = (deps: { firestore: Firestore }): RoleReader => ({
  getRoles: async ({ roleIds }) => {
    if (roleIds.length === 0) return [];
    const refs = roleIds.map((id) => roleCollectionOf(deps.firestore).withConverter(storedRoleConverter).doc(id));
    // At most 10 roles per grant, read in parallel (typed; `getAll` drops the converter type).
    const snapshots = await Promise.all(refs.map((ref) => ref.get()));
    return snapshots.flatMap((snapshot) => {
      const role = snapshot.data();
      return role === undefined
        ? []
        : [{ id: role.id, tenantId: role.tenantId, permissions: role.permissions, isDeleted: role.deletedAt !== null }];
    });
  },
});
