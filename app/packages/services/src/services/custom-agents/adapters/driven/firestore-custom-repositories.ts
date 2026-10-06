import {
  CustomAgentIdSchema,
  CustomAgentSchema,
  type CustomSkill,
  CustomSkillIdSchema,
  CustomSkillSchema,
} from "@core/contracts";
import {
  type CollectionReference,
  type DocumentData,
  FieldPath,
  type Firestore,
  type Query,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import type { z } from "zod";
import { CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { CorruptDocumentError } from "#/services/shared/firestore/corrupt-document-error.ts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import {
  type CustomAgentRepository,
  type CustomSkillRepository,
  MAX_CUSTOM_RECORDS_PER_TENANT,
} from "../../application/ports/custom-agent-ports.ts";

/** Top-level collections of tenant-defined agents and skills (decision 0046); Security Rules deny every client. */
export const CUSTOM_AGENTS_COLLECTION = "custom-agents";
export const CUSTOM_SKILLS_COLLECTION = "custom-skills";

const TIMESTAMP_FIELDS = ["createdAt", "updatedAt"] as const;
// Stored next to the contract fields; the wire contract is strict, so they are dropped on read.
const STORAGE_ONLY_FIELDS = new Set(["schemaVersion", "updatedBy"]);

type Stored = {
  readonly id: string;
  readonly tenantId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
type Snapshot = {
  readonly id: string;
  readonly ref: { readonly path: string };
  readonly data: () => DocumentData | undefined;
};

const toDocument = (record: Stored, actorId: string): DocumentData => {
  const { id, ...fields } = record;
  void id;
  return {
    ...fields,
    createdAt: Timestamp.fromDate(new Date(record.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(record.updatedAt)),
    updatedBy: actorId,
    schemaVersion: CORE_SCHEMA_VERSION,
  };
};

/** @throws {CorruptDocumentError} when the stored document does not match the contract. */
const reader =
  <T>(schema: z.ZodType<T>) =>
  (snapshot: Snapshot): T | null => {
    const data = snapshot.data();
    if (data === undefined) return null;
    const fields = Object.fromEntries(Object.entries(data).filter(([key]) => !STORAGE_ONLY_FIELDS.has(key)));
    for (const key of TIMESTAMP_FIELDS)
      if (fields[key] instanceof Timestamp) fields[key] = fields[key].toDate().toISOString();
    const parsed = schema.safeParse({ ...fields, id: snapshot.id });
    if (parsed.success) return parsed.data;
    throw new CorruptDocumentError({
      documentPath: snapshot.ref.path,
      issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))],
    });
  };

const readAgent = reader(CustomAgentSchema);
const readSkill = reader(CustomSkillSchema);

const newestFirst = (collection: CollectionReference, tenantId: string): Query =>
  collection.where("tenantId", "==", tenantId).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");

const countOf = async (collection: CollectionReference, tenantId: string): Promise<number> =>
  (await collection.where("tenantId", "==", tenantId).count().get()).data().count;

const getDoc = (tx: Transaction | undefined, collection: CollectionReference, id: string) =>
  tx === undefined ? collection.doc(id).get() : tx.get(collection.doc(id));

/**
 * Firestore `CustomAgentRepository` over `custom-agents/{autoId}` (automatic ids, `tenantId` on
 * every document, `schemaVersion`). A document of another tenant reads as missing.
 */
export const createFirestoreCustomAgentRepository = (deps: { firestore: Firestore }): CustomAgentRepository => {
  const collection = () => deps.firestore.collection(CUSTOM_AGENTS_COLLECTION);
  return {
    newId: () => CustomAgentIdSchema.parse(collection().doc().id),
    get: async (tx, { tenantId, agentId }) => {
      const agent = readAgent(await getDoc(tx, collection(), agentId));
      return agent?.tenantId === tenantId ? agent : null;
    },
    listByTenant: async ({ tenantId }) =>
      (await newestFirst(collection(), tenantId).limit(MAX_CUSTOM_RECORDS_PER_TENANT).get()).docs.flatMap(
        (doc) => readAgent(doc) ?? [],
      ),
    count: ({ tenantId }) => countOf(collection(), tenantId),
    create: (tx, { agent }) => void tx.create(collection().doc(agent.id), toDocument(agent, agent.createdBy)),
    replace: (tx, { agent, actorId }) => void tx.set(collection().doc(agent.id), toDocument(agent, actorId)),
    delete: (tx, { agentId }) => void tx.delete(collection().doc(agentId)),
  };
};

/**
 * Firestore `CustomSkillRepository` over `custom-skills/{autoId}`. Lists use the composite index
 * `tenantId + createdAt desc`; the name lookup is equality only.
 */
export const createFirestoreCustomSkillRepository = (deps: { firestore: Firestore }): CustomSkillRepository => {
  const collection = () => deps.firestore.collection(CUSTOM_SKILLS_COLLECTION);
  return {
    newId: () => CustomSkillIdSchema.parse(collection().doc().id),
    get: async (tx, { tenantId, skillId }) => {
      const skill = readSkill(await getDoc(tx, collection(), skillId));
      return skill?.tenantId === tenantId ? skill : null;
    },
    list: async ({ tenantId, page }) => {
      let query = newestFirst(collection(), tenantId);
      if (page.after !== undefined)
        query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.flatMap((doc) => readSkill(doc) ?? []);
      return pageFromOverfetch({
        fetched,
        limit: page.limit,
        positionOf: (skill: CustomSkill) => [skill.createdAt, skill.id],
      });
    },
    listByTenant: async ({ tenantId }) =>
      (await newestFirst(collection(), tenantId).limit(MAX_CUSTOM_RECORDS_PER_TENANT).get()).docs.flatMap(
        (doc) => readSkill(doc) ?? [],
      ),
    findByName: async (tx, { tenantId, name }) => {
      const query = collection().where("tenantId", "==", tenantId).where("name", "==", name).limit(1);
      const [doc] = (tx === undefined ? await query.get() : await tx.get(query)).docs;
      return doc === undefined ? null : readSkill(doc);
    },
    count: ({ tenantId }) => countOf(collection(), tenantId),
    create: (tx, { skill }) => void tx.create(collection().doc(skill.id), toDocument(skill, skill.createdBy)),
    replace: (tx, { skill, actorId }) => void tx.set(collection().doc(skill.id), toDocument(skill, actorId)),
    delete: (tx, { skillId }) => void tx.delete(collection().doc(skillId)),
  };
};
