import type { ContractDefinition } from "@core/contracts";
import {
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import type { z } from "zod";
import { CorruptDocumentError } from "./corrupt-document-error.ts";
import { type FieldPath, listDateTimePaths, mapAtPaths } from "./date-time-paths.ts";

const ID_FIELD = "id";

const hasIdField = (schema: z.ZodType): boolean => {
  const shape = (schema._zod.def as { shape?: Record<string, unknown> }).shape;
  return shape !== undefined && ID_FIELD in shape;
};

// Wire contracts carry ISO strings; Firestore stores Timestamp (contracts/firebase-firestore.md §13).
const isoToTimestamp = (leaf: unknown): unknown =>
  typeof leaf === "string" ? Timestamp.fromDate(new Date(leaf)) : leaf;
const timestampToIso = (leaf: unknown): unknown => (leaf instanceof Timestamp ? leaf.toDate().toISOString() : leaf);

const withoutId = (data: DocumentData): DocumentData =>
  Object.fromEntries(Object.entries(data).filter(([key]) => key !== ID_FIELD));

/**
 * Firestore converter driven by a contract (decision 0006 §6):
 * - write: ISO date-time fields become `Timestamp`; sentinels such as
 *   `FieldValue.serverTimestamp()` pass through; the `id` field is dropped
 *   because the document id holds it. Writes are not parsed (sentinels would fail);
 *   use cases validate their input at the boundary.
 * - read: `Timestamp` becomes ISO, the document id fills `id`, and the result
 *   is parsed with the contract.
 * @throws {CorruptDocumentError} from `snapshot.data()` (where the converter runs),
 *   when the stored data does not match the contract.
 */
export const createContractConverter = <Schema extends z.ZodType<DocumentData>>(
  contract: Pick<ContractDefinition<Schema>, "schema">,
): FirestoreDataConverter<z.output<Schema>> => {
  const dateTimePaths = listDateTimePaths(contract.schema);
  const includeId = hasIdField(contract.schema);
  return {
    // One implementation serves both overloads (full set and merge set): the
    // model is always a plain object whose date-time leaves may be sentinels.
    toFirestore: (model: DocumentData): DocumentData => {
      const converted = mapAtPaths(model, dateTimePaths, isoToTimestamp);
      return includeId ? withoutId(converted) : converted;
    },
    fromFirestore: (snapshot: QueryDocumentSnapshot): z.output<Schema> => {
      const stored = { ...snapshot.data(), ...(includeId ? { [ID_FIELD]: snapshot.id } : {}) };
      const parsed = contract.schema.safeParse(mapAtPaths(stored, dateTimePaths, timestampToIso));
      if (parsed.success) return parsed.data;
      const issuePaths = [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))];
      throw new CorruptDocumentError({ documentPath: snapshot.ref.path, issuePaths });
    },
  };
};

const FIELD_SEPARATOR = ".";

/** Date-time paths below a patch key: `[["endsAt"]]` for key `window` when `window.endsAt` is a date-time. */
const pathsBelowKey = (key: string, dateTimePaths: readonly FieldPath[]): FieldPath[] => {
  const segments = key.split(FIELD_SEPARATOR);
  return dateTimePaths
    .filter((path) => path.length >= segments.length && segments.every((segment, index) => path[index] === segment))
    .map((path) => path.slice(segments.length));
};

/**
 * Converts a patch for `DocumentReference.update()` / `Transaction.update()`, which
 * never run the converter's `toFirestore`: ISO date-time values at the contract's
 * date-time paths become `Timestamp`, so `update()` stores the same types as `set()`.
 *
 * Keys are top-level field names or dotted paths (`"window.endsAt"`); sentinels such
 * as `FieldValue.serverTimestamp()` or `FieldValue.delete()` pass through.
 * Limits: `FieldPath` objects as keys and `FieldValue.arrayUnion(...)` elements are
 * not converted (build those values with `Timestamp` yourself), and the patch is not
 * validated (use cases validate their input at the boundary).
 * @example
 *   await ref.update(toFirestoreUpdate(SampleContract, { name: "B", "window.endsAt": "2026-10-01T00:00:00.000Z" }));
 */
export const toFirestoreUpdate = <Schema extends z.ZodType<DocumentData>>(
  contract: Pick<ContractDefinition<Schema>, "schema">,
  patch: Readonly<Record<string, unknown>>,
): DocumentData => {
  const dateTimePaths = listDateTimePaths(contract.schema);
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      mapAtPaths(value, pathsBelowKey(key, dateTimePaths), isoToTimestamp),
    ]),
  );
};
