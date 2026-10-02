import { type Connector, ConnectorIdSchema, type ConnectorLoadError, ConnectorSchema } from "@core/contracts";
import { type DocumentData, FieldPath, type Firestore, type QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { CorruptDocumentError } from "../../../shared/firestore/corrupt-document-error.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ConnectorRepository } from "../../application/ports/connector-ports.ts";

/** Top-level collection of tenant connectors (SP3 spec §9); Security Rules deny every client. */
export const CONNECTORS_COLLECTION = "connectors";

const TIMESTAMP_FIELDS = ["createdAt", "updatedAt"] as const;
// Stored next to the contract fields; the wire contract is strict, so they are dropped on read.
const STORAGE_ONLY_FIELDS = new Set(["schemaVersion", "updatedBy"]);

// `lastError.at` is a Firestore Timestamp at rest, an ISO string on the wire.
const lastErrorToDocument = (lastError: ConnectorLoadError | null) =>
  lastError === null ? null : { code: lastError.code, at: Timestamp.fromDate(new Date(lastError.at)) };

const lastErrorFromDocument = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("at" in value) || !(value.at instanceof Timestamp)) return value;
  return { ...value, at: value.at.toDate().toISOString() };
};

const toDocument = (connector: Connector, actorId: string): DocumentData => {
  const { id, lastError, ...fields } = connector;
  void id;
  return {
    ...fields,
    ...(lastError === undefined ? {} : { lastError: lastErrorToDocument(lastError) }),
    createdAt: Timestamp.fromDate(new Date(connector.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(connector.updatedAt)),
    updatedBy: actorId,
    schemaVersion: CORE_SCHEMA_VERSION,
  };
};

/** @throws {CorruptDocumentError} when the stored document does not match the contract. */
const fromSnapshot = (snapshot: QueryDocumentSnapshot | { id: string; ref: { path: string }; data: () => DocumentData | undefined }): Connector | null => {
  const data = snapshot.data();
  if (data === undefined) return null;
  const fields = Object.fromEntries(Object.entries(data).filter(([key]) => !STORAGE_ONLY_FIELDS.has(key)));
  for (const key of TIMESTAMP_FIELDS) if (fields[key] instanceof Timestamp) fields[key] = fields[key].toDate().toISOString();
  if ("lastError" in fields) fields["lastError"] = lastErrorFromDocument(fields["lastError"]);
  const parsed = ConnectorSchema.safeParse({ ...fields, id: snapshot.id });
  if (parsed.success) return parsed.data;
  throw new CorruptDocumentError({ documentPath: snapshot.ref.path, issuePaths: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] });
};

/**
 * Firestore `ConnectorRepository` over `connectors/{autoId}` (automatic ids, `tenantId` on
 * every document, `schemaVersion`). A document of another tenant reads as missing. Lists use
 * the composite index `tenantId + createdAt desc` (`firestore.indexes.json`).
 */
export const createFirestoreConnectorRepository = (deps: { firestore: Firestore }): ConnectorRepository => {
  const collection = () => deps.firestore.collection(CONNECTORS_COLLECTION);
  return {
    newId: () => ConnectorIdSchema.parse(collection().doc().id),
    get: async (tx, { tenantId, connectorId }) => {
      const ref = collection().doc(connectorId);
      const connector = fromSnapshot(tx === undefined ? await ref.get() : await tx.get(ref));
      return connector?.tenantId === tenantId ? connector : null;
    },
    list: async ({ tenantId, page }) => {
      let query = collection().where("tenantId", "==", tenantId).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined) query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.flatMap((doc) => fromSnapshot(doc) ?? []);
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (connector: Connector) => [connector.createdAt, connector.id] });
    },
    listActive: async ({ tenantId }) =>
      (await collection().where("tenantId", "==", tenantId).where("status", "==", "active").get()).docs.flatMap((doc) => fromSnapshot(doc) ?? []),
    recordLoad: async ({ tenantId, connectorId, lastError }) => {
      const ref = collection().doc(connectorId);
      await deps.firestore.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (snapshot.get("tenantId") !== tenantId) return;
        tx.update(ref, { lastError: lastErrorToDocument(lastError) });
      });
    },
    create: (tx, { connector }) => void tx.create(collection().doc(connector.id), toDocument(connector, connector.createdBy)),
    replace: (tx, { connector, actorId }) => void tx.set(collection().doc(connector.id), toDocument(connector, actorId)),
    delete: (tx, { connectorId }) => void tx.delete(collection().doc(connectorId)),
  };
};
