import { UpdateModelSettingsInputSchema } from "@core/contracts";
import { type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_SCHEMA_VERSION } from "#/services/shared/firestore/collections.ts";
import { CorruptDocumentError } from "#/services/shared/firestore/corrupt-document-error.ts";
import type { ModelSettingsRepository } from "../../application/ports/model-settings-repository.ts";

/** `model-settings/platform`: platform data managed by staff (decision 0072). */
export const MODEL_SETTINGS_COLLECTION = "model-settings";
export const MODEL_SETTINGS_DOCUMENT = "platform";

export const createFirestoreModelSettingsRepository = (deps: {
  readonly firestore: Firestore;
}): ModelSettingsRepository => {
  const ref = () => deps.firestore.collection(MODEL_SETTINGS_COLLECTION).doc(MODEL_SETTINGS_DOCUMENT);
  return {
    get: async () => {
      const snapshot = await ref().get();
      if (!snapshot.exists) return null;
      const updatedAt: unknown = snapshot.get("updatedAt");
      const parsed = UpdateModelSettingsInputSchema.safeParse({
        roles: snapshot.get("roles") as unknown,
        models: snapshot.get("models") as unknown,
      });
      if (parsed.success && updatedAt instanceof Timestamp)
        return { ...parsed.data, updatedAt: updatedAt.toDate().toISOString() };
      throw new CorruptDocumentError({
        documentPath: snapshot.ref.path,
        issuePaths: parsed.success
          ? ["updatedAt"]
          : [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))],
      });
    },
    save: async ({ roles, models, updatedAt, actorId }) => {
      await ref().set({
        roles,
        models,
        updatedAt: Timestamp.fromDate(new Date(updatedAt)),
        updatedBy: actorId,
        schemaVersion: CORE_SCHEMA_VERSION,
      });
    },
  };
};
