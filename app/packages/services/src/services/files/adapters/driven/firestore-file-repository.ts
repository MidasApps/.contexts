import { FileIdSchema, type StoredFile, StoredFileSchema } from "@core/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import type { FileRepository, FileSettlement } from "../../application/ports/file-ports.ts";

/** Top-level Firestore collection of file records; clients never read it (they use `/v1`). */
export const FILES_COLLECTION = "files";

// The stored document: the contract plus its shape version (contracts/firebase-firestore.md §17).
const StoredFileDocumentSchema = z.strictObject({
  ...StoredFileSchema.shape,
  schemaVersion: z.literal(CORE_SCHEMA_VERSION),
});
const stored = { schema: StoredFileDocumentSchema };
const converter = createContractConverter(stored);

// The stored schema already checked `schemaVersion`; the contract has no such field.
const toFile = (document: z.output<typeof StoredFileDocumentSchema>): StoredFile =>
  StoredFileSchema.parse(Object.fromEntries(Object.entries(document).filter(([key]) => key !== "schemaVersion")));

const settledFields = (settlement: FileSettlement, updatedAt: string): Record<string, unknown> =>
  settlement.status === "ready"
    ? {
        status: "ready",
        contentType: settlement.contentType,
        sizeBytes: settlement.sizeBytes,
        rejectionReason: null,
        updatedAt,
      }
    : { status: "rejected", rejectionReason: settlement.reason, sizeBytes: settlement.sizeBytes, updatedAt };

/** Firestore `FileRepository` over the top-level `files` collection (automatic ids, `tenantId` on every doc). */
export const createFirestoreFileRepository = (deps: { readonly firestore: Firestore }): FileRepository => {
  const raw = () => deps.firestore.collection(FILES_COLLECTION);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => FileIdSchema.parse(raw().doc().id),
    create: async (file) => {
      await typed()
        .doc(file.id)
        .create({ ...file, schemaVersion: CORE_SCHEMA_VERSION });
    },
    get: async (fileId) => {
      const data = (await typed().doc(fileId).get()).data();
      return data === undefined ? null : toFile(data);
    },
    settle: ({ fileId, settlement, updatedAt }) =>
      deps.firestore.runTransaction(async (tx) => {
        const ref = typed().doc(fileId);
        const current = (await tx.get(ref)).data();
        if (current?.status !== "pending") return null;
        const patch = settledFields(settlement, updatedAt);
        tx.update(raw().doc(fileId), toFirestoreUpdate(stored, patch));
        return toFile({ ...current, ...patch });
      }),
  };
};
