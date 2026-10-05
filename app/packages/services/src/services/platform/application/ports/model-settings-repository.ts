import type { UpdateModelSettingsInput } from "@core/contracts";

/** What staff saved: the model of each text role and the staff prices (decision 0072). */
export type StoredModelSettings = UpdateModelSettingsInput & { readonly updatedAt: string };

/** Firestore `model-settings/platform`: one document for the whole platform. */
export type ModelSettingsRepository = {
  /** @returns null when staff never saved the settings. */
  readonly get: () => Promise<StoredModelSettings | null>;
  readonly save: (input: StoredModelSettings & { readonly actorId: string }) => Promise<void>;
};
