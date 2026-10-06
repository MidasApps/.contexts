import type {
  ModelSettingsRepository,
  StoredModelSettings,
} from "../../application/ports/model-settings-repository.ts";

/** In-memory `ModelSettingsRepository` for tests and fake runtimes. */
export const createInMemoryModelSettingsRepository = (
  initial: StoredModelSettings | null = null,
): ModelSettingsRepository => {
  let stored = initial;
  return {
    get: () => Promise.resolve(stored),
    save: ({ roles, models, updatedAt }) => {
      stored = { roles, models, updatedAt };
      return Promise.resolve();
    },
  };
};
