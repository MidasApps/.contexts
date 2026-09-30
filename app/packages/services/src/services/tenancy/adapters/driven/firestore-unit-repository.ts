import { IsoDateTimeSchema, UnitIdSchema, UnitSchema, type Unit } from "@core/contracts";
import { FieldPath, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { UnitRepository } from "../../application/ports/driven/unit-repository.ts";

/** Stored unit: the contract (tree refinement kept) plus `deletedAt`. */
export const StoredUnitSchema = UnitSchema.safeExtend({ deletedAt: IsoDateTimeSchema.nullable() });

const stored = { schema: StoredUnitSchema };
const converter = createContractConverter(stored);

/** Writes per batch in subtree rewrites and deletes. */
const BATCH_SIZE = 400;

const liveOnly = (value: (Unit & { deletedAt: string | null }) | undefined): Unit | null => {
  if (value === undefined) return null;
  const { deletedAt, ...unit } = value;
  return deletedAt === null ? unit : null;
};

const chunks = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) => items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));

/** Firestore `UnitRepository` over the top-level `units` collection. */
export const createFirestoreUnitRepository = (deps: { firestore: Firestore }): UnitRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.units);
  const typed = () => raw().withConverter(converter);
  const live = () => typed().where("deletedAt", "==", null);
  const inBatches = async <T>(items: readonly T[], write: (batch: WriteBatch, item: T) => void): Promise<void> => {
    for (const chunk of chunks(items)) {
      const batch = deps.firestore.batch();
      for (const item of chunk) write(batch, item);
      await batch.commit();
    }
  };
  return {
    newId: () => UnitIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return liveOnly((tx === undefined ? await ref.get() : await tx.get(ref)).data());
    },
    getMany: async (ids) => (await Promise.all(ids.map((id) => typed().doc(id).get()))).flatMap((snapshot) => liveOnly(snapshot.data()) ?? []),
    listChildren: async ({ projectId, parentUnitId, page }) => {
      let query = live().where("projectId", "==", projectId).where("parentUnitId", "==", parentUnitId).orderBy("name").orderBy(FieldPath.documentId());
      if (page.after !== undefined) query = query.startAfter(...page.after);
      const fetched = (await query.limit(page.limit + 1).get()).docs.flatMap((doc) => liveOnly(doc.data()) ?? []);
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (unit) => [unit.name, unit.id] });
    },
    listOfProject: async ({ projectId, limit }) =>
      (await live().where("projectId", "==", projectId).limit(limit).get()).docs.flatMap((doc) => liveOnly(doc.data()) ?? []),
    listDescendants: async ({ tenantId, unitId, limit }) =>
      (await live().where("tenantId", "==", tenantId).where("ancestorIds", "array-contains", unitId).limit(limit).get()).docs.flatMap(
        (doc) => liveOnly(doc.data()) ?? [],
      ),
    create: (tx, { unit, actorId }) =>
      void tx.create(raw().doc(unit.id), {
        ...converter.toFirestore({ ...unit, deletedAt: null }),
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    update: (tx, { unit, actorId }) =>
      void tx.update(
        raw().doc(unit.id),
        toFirestoreUpdate(stored, {
          name: unit.name,
          settings: unit.settings,
          parentUnitId: unit.parentUnitId,
          ancestorIds: unit.ancestorIds,
          depth: unit.depth,
          updatedAt: unit.updatedAt,
          updatedBy: actorId,
        }),
      ),
    softDelete: (tx, { id, deletedAt, actorId }) =>
      void tx.update(raw().doc(id), toFirestoreUpdate(stored, { deletedAt, deletedBy: actorId, updatedAt: deletedAt, updatedBy: actorId })),
    rewriteTree: ({ rewrites, updatedAt, actorId }) =>
      inBatches(rewrites, (batch, rewrite) =>
        batch.update(
          raw().doc(rewrite.id),
          toFirestoreUpdate(stored, { parentUnitId: rewrite.parentUnitId, ancestorIds: [...rewrite.ancestorIds], depth: rewrite.depth, updatedAt, updatedBy: actorId }),
        ),
      ),
    softDeleteMany: ({ ids, deletedAt, actorId }) =>
      inBatches(ids, (batch, id) => batch.update(raw().doc(id), toFirestoreUpdate(stored, { deletedAt, deletedBy: actorId, updatedAt: deletedAt, updatedBy: actorId }))),
  };
};
