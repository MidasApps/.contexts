import { IsoDateTimeSchema, type Project, ProjectIdSchema, ProjectSchema } from "@core/contracts";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ProjectRepository } from "../../application/ports/driven/project-repository.ts";

/** Stored project: the contract plus `deletedAt` (audit fields and `schemaVersion` are stripped on read). */
export const StoredProjectSchema = ProjectSchema.extend({ deletedAt: IsoDateTimeSchema.nullable() });

const stored = { schema: StoredProjectSchema };
const converter = createContractConverter(stored);

const liveOnly = (value: (Project & { deletedAt: string | null }) | undefined): Project | null => {
  if (value === undefined) return null;
  const { deletedAt, ...project } = value;
  return deletedAt === null ? project : null;
};

/** Firestore `ProjectRepository` over the top-level `projects` collection. */
export const createFirestoreProjectRepository = (deps: { firestore: Firestore }): ProjectRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.projects);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => ProjectIdSchema.parse(raw().doc().id),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return liveOnly((tx === undefined ? await ref.get() : await tx.get(ref)).data());
    },
    getMany: async ({ tenantId, ids }) => {
      const snapshots = await Promise.all(ids.map((id) => typed().doc(id).get()));
      return snapshots
        .flatMap((snapshot) => liveOnly(snapshot.data()) ?? [])
        .filter((project) => project.tenantId === tenantId);
    },
    list: async ({ tenantId, page }) => {
      let query = typed()
        .where("tenantId", "==", tenantId)
        .where("deletedAt", "==", null)
        .orderBy("name")
        .orderBy(FieldPath.documentId());
      if (page.after !== undefined) query = query.startAfter(...page.after);
      const fetched = (await query.limit(page.limit + 1).get()).docs.flatMap((doc) => liveOnly(doc.data()) ?? []);
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (project) => [project.name, project.id] });
    },
    create: (tx, { project, actorId }) =>
      void tx.create(raw().doc(project.id), {
        ...converter.toFirestore({ ...project, deletedAt: null }),
        createdBy: actorId,
        updatedBy: actorId,
        deletedBy: null,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    update: (tx, { project, actorId }) =>
      void tx.update(
        raw().doc(project.id),
        toFirestoreUpdate(stored, {
          name: project.name,
          description: project.description ?? FieldValue.delete(),
          status: project.status,
          settings: project.settings,
          updatedAt: project.updatedAt,
          updatedBy: actorId,
        }),
      ),
    softDelete: (tx, { id, deletedAt, actorId }) =>
      void tx.update(
        raw().doc(id),
        toFirestoreUpdate(stored, { deletedAt, deletedBy: actorId, updatedAt: deletedAt, updatedBy: actorId }),
      ),
  };
};
