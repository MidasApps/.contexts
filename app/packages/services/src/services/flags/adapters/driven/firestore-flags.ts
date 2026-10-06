import { FieldPath, FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import type { EnvironmentFlagValues, TenantFlagOverrides } from "../../application/ports/flag-store.ts";

/**
 * Environment values in local (Remote Config has no emulator): `feature-flags/{flagKey}`. The
 * document id is the registry key, like `agent-settings/{tenantId}`: one document per code-declared
 * flag, so an automatic id would only add a lookup (ADR 0005 exception, decision 0039 amendment).
 */
export const FEATURE_FLAGS_COLLECTION = "feature-flags";
/** Per-organization overrides in every environment: `feature-flag-overrides/{tenantId}` with a `values` map. */
export const FEATURE_FLAG_OVERRIDES_COLLECTION = "feature-flag-overrides";

// Only booleans count; anything else in a hand-edited document reads as "not set".
const booleansOf = (values: unknown): Record<string, boolean> =>
  typeof values === "object" && values !== null
    ? Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
      )
    : {};

export const createFirestoreEnvironmentFlagValues = (deps: {
  readonly firestore: Firestore;
  readonly now?: () => Date;
}): EnvironmentFlagValues => ({
  read: async () => {
    const snapshot = await deps.firestore.collection(FEATURE_FLAGS_COLLECTION).get();
    return booleansOf(Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.get("value") as unknown])));
  },
  write: async ({ key, value, updatedBy }) => {
    const updatedAt = Timestamp.fromDate((deps.now ?? (() => new Date()))());
    await deps.firestore
      .collection(FEATURE_FLAGS_COLLECTION)
      .doc(key)
      .set({ key, value, updatedAt, updatedBy, schemaVersion: CORE_SCHEMA_VERSION });
  },
});

export const createFirestoreTenantFlagOverrides = (deps: {
  readonly firestore: Firestore;
  readonly now?: () => Date;
}): TenantFlagOverrides => ({
  read: async (tenantId) =>
    booleansOf((await deps.firestore.collection(FEATURE_FLAG_OVERRIDES_COLLECTION).doc(tenantId).get()).get("values")),
  write: async ({ key, tenantId, value, updatedBy }) => {
    const updatedAt = Timestamp.fromDate((deps.now ?? (() => new Date()))());
    // `set` with merge treats the map's keys as names, so dotted flag keys stay single fields.
    await deps.firestore
      .collection(FEATURE_FLAG_OVERRIDES_COLLECTION)
      .doc(tenantId)
      .set(
        { tenantId, values: { [key]: value }, updatedAt, updatedBy, schemaVersion: CORE_SCHEMA_VERSION },
        { merge: true },
      );
  },
  clear: ({ key, tenantId, updatedBy }) =>
    deps.firestore.runTransaction(async (tx) => {
      const ref = deps.firestore.collection(FEATURE_FLAG_OVERRIDES_COLLECTION).doc(tenantId);
      const snapshot = await tx.get(ref);
      if (!(key in booleansOf(snapshot.get("values")))) return false;
      // A `FieldPath`, not a dotted string: flag keys contain dots, which `update` would read as nesting.
      tx.update(
        ref,
        new FieldPath("values", key),
        FieldValue.delete(),
        "updatedAt",
        Timestamp.fromDate((deps.now ?? (() => new Date()))()),
        "updatedBy",
        updatedBy,
      );
      return true;
    }),
});
