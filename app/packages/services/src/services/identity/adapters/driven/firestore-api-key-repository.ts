import { type ApiKey, ApiKeyIdSchema, ApiKeySchema } from "@core/contracts";
import { FieldPath, type Firestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { CORE_COLLECTIONS, CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import { createContractConverter, toFirestoreUpdate } from "../../../shared/firestore/contract-converter.ts";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ApiKeyRepository } from "../../application/ports/driven/api-key-repository.ts";

// Lists parse with the wire contract (no hash); only the authentication lookup reads `secretHash`.
const converter = createContractConverter({ schema: ApiKeySchema });
const StoredSchema = z.object({ ...ApiKeySchema.shape, secretHash: z.string().regex(/^[a-f0-9]{64}$/) });
const storedConverter = createContractConverter({ schema: StoredSchema });

/**
 * Firestore `ApiKeyRepository` over `api-keys` (server-only; Security Rules deny it). The
 * document holds the contract fields plus `secretHash`, audit fields and `schemaVersion`;
 * `authorize()` reads the same document through the principal status reader.
 */
export const createFirestoreApiKeyRepository = (deps: { firestore: Firestore }): ApiKeyRepository => {
  const raw = () => deps.firestore.collection(CORE_COLLECTIONS.apiKeys);
  const typed = () => raw().withConverter(converter);
  return {
    newId: () => ApiKeyIdSchema.parse(raw().doc().id),
    create: (tx, { apiKey, secretHash, actorId }) =>
      void tx.create(raw().doc(apiKey.id), {
        ...converter.toFirestore(apiKey),
        secretHash,
        createdBy: actorId,
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      }),
    get: async (tx, id) => {
      const ref = typed().doc(id);
      return (tx === undefined ? await ref.get() : await tx.get(ref)).data() ?? null;
    },
    findByPublicId: async (publicId) => {
      const stored = (
        await raw().withConverter(storedConverter).where("publicId", "==", publicId).limit(1).get()
      ).docs[0]?.data();
      if (stored === undefined) return null;
      const { secretHash, ...apiKey } = stored;
      return { apiKey, secretHash };
    },
    list: async ({ tenantId, page }) => {
      let query = typed()
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (page.after !== undefined)
        query = query.startAfter(Timestamp.fromDate(new Date(page.after[0])), page.after[1]);
      const fetched = (await query.limit(page.limit + 1).get()).docs.map((doc) => doc.data());
      return pageFromOverfetch({ fetched, limit: page.limit, positionOf: (key: ApiKey) => [key.createdAt, key.id] });
    },
    listActiveOfOwner: async ({ tenantId, ownerUid }) =>
      (
        await typed()
          .where("tenantId", "==", tenantId)
          .where("ownerUid", "==", ownerUid)
          .where("status", "==", "active")
          .get()
      ).docs.map((doc) => doc.data()),
    revoke: (tx, { id, reason, updatedAt, actorId }) =>
      void tx.update(
        raw().doc(id),
        toFirestoreUpdate(
          { schema: ApiKeySchema },
          { status: "revoked", revokedReason: reason, updatedAt, updatedBy: actorId },
        ),
      ),
    touchLastUsed: async ({ id, lastUsedAt }) => {
      await raw()
        .doc(id)
        .update(toFirestoreUpdate({ schema: ApiKeySchema }, { lastUsedAt }));
    },
  };
};
