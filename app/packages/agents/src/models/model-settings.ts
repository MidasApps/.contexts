import {
  EDITABLE_MODEL_ROLES,
  type EditableModelRole,
  type ModelCatalogEntry,
  type ModelRoleSetting,
  type ModelSettings,
  type UpdateModelSettingsInput,
} from "@core/contracts";
import type { Logger, ModelSettingsRepository, StoredModelSettings } from "@core/services";
import type { ModelPrice } from "./model-prices.ts";
import { MODEL_ROLES, type ModelProvider, parseModelId } from "./model-roles.ts";

/** Roles staff cannot change here: a new embedding model needs a reindex, and voice follows its own flags (decision 0072). */
const FIXED_ROLES = ["embedding", "transcription", "speech", "realtime"] as const;

type RoleEnvKey = (typeof MODEL_ROLES)[keyof typeof MODEL_ROLES]["envKey"];
// The realtime voice model is only set where realtime voice is composed.
type RoleEnv = Readonly<Record<Exclude<RoleEnvKey, "AI_MODEL_REALTIME">, string>> & {
  readonly AI_MODEL_REALTIME?: string | undefined;
};

export type ModelSettingsRefusal = {
  readonly code: "VALIDATION_FAILED";
  readonly field: string;
  readonly issue: string;
};

export type ModelSettingsService = {
  /** The model a text role runs on now: what staff saved, else the environment default. Never waits. */
  readonly modelIdOf: (role: EditableModelRole) => string;
  /** The price table the ledger reads now: the code prices with the staff prices over them. Never waits. */
  readonly prices: () => Readonly<Record<string, ModelPrice>>;
  /** The settings as the console shows them, read fresh from the store. */
  readonly view: () => Promise<ModelSettings>;
  /** Saves what staff chose; refused when a role names an unpriced model or a provider without a key. */
  readonly update: (
    input: UpdateModelSettingsInput,
    actorId: string,
  ) => Promise<{ ok: true; data: ModelSettings } | { ok: false; error: ModelSettingsRefusal }>;
  /** Reads the store now (boot and tests); a failed read keeps what was loaded before. */
  readonly refresh: () => Promise<void>;
};

export type ModelSettingsServiceArgs = {
  readonly store: ModelSettingsRepository;
  readonly env: RoleEnv;
  readonly aiMode: "fake" | "real";
  /** The prices that ship with the code (`priceTableFor`). */
  readonly codePrices: Readonly<Record<string, ModelPrice>>;
  readonly isConfigured: (provider: ModelProvider) => boolean;
  readonly logger: Pick<Logger, "warn">;
  readonly now?: () => Date;
  /** How long a loaded copy is served before it is read again in the background (default 60 s). */
  readonly ttlMs?: number;
};

const DEFAULT_TTL_MS = 60_000;

const priceOf = (entry: UpdateModelSettingsInput["models"][number]): ModelPrice => ({
  inputMicroUsdPerMTok: entry.inputMicroUsdPerMTok,
  outputMicroUsdPerMTok: entry.outputMicroUsdPerMTok,
});

const mergePrices = (
  codePrices: Readonly<Record<string, ModelPrice>>,
  staffPrices: UpdateModelSettingsInput["models"],
): Readonly<Record<string, ModelPrice>> => ({
  ...codePrices,
  ...Object.fromEntries(staffPrices.map((entry) => [entry.modelId, priceOf(entry)])),
});

/** Why `input` cannot be saved, or `null` when every role names a priced model the runtime can call. */
const refusalOf = (args: ModelSettingsServiceArgs, input: UpdateModelSettingsInput): ModelSettingsRefusal | null => {
  const prices = mergePrices(args.codePrices, input.models);
  for (const role of EDITABLE_MODEL_ROLES) {
    const modelId = input.roles[role];
    if (prices[modelId] === undefined) return { code: "VALIDATION_FAILED", field: `roles.${role}`, issue: "UNPRICED" };
    // Fake mode never calls a provider, so a missing key blocks nothing there.
    if (args.aiMode === "real" && !args.isConfigured(parseModelId(modelId).provider))
      return { code: "VALIDATION_FAILED", field: `roles.${role}`, issue: "PROVIDER_NOT_CONFIGURED" };
  }
  return null;
};

/**
 * The model of each text role and the model prices, set by staff in `/admin/models` (decision 0072).
 * `modelIdOf` and `prices` answer from a copy in memory, read again in the background once it is
 * older than the TTL: a change reaches every runtime instance within that time, and a model call
 * never waits for the store.
 */
export const createModelSettingsService = (args: ModelSettingsServiceArgs): ModelSettingsService => {
  const now = args.now ?? (() => new Date());
  const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
  let stored: StoredModelSettings | null = null;
  let prices = args.codePrices;
  let loadedAt = Number.NEGATIVE_INFINITY;
  let loading: Promise<void> | null = null;

  const adopt = (next: StoredModelSettings | null): void => {
    stored = next;
    prices = mergePrices(args.codePrices, next?.models ?? []);
    loadedAt = now().getTime();
  };
  const refresh = (): Promise<void> => {
    loading ??= args.store
      .get()
      .then(adopt)
      .catch((error: unknown) => {
        // Serve the previous copy and try again after the TTL, not on every model call.
        loadedAt = now().getTime();
        args.logger.warn("model_settings_read_failed", { err: error });
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  };
  const touch = (): void => {
    if (now().getTime() - loadedAt >= ttlMs) void refresh();
  };
  const modelIdOf = (role: EditableModelRole): string => stored?.roles[role] ?? args.env[MODEL_ROLES[role].envKey];

  const view = (): ModelSettings => {
    const staffPriced = new Set((stored?.models ?? []).map((entry) => entry.modelId));
    const roles: ModelRoleSetting[] = [
      ...EDITABLE_MODEL_ROLES.map((role) => ({
        role,
        modelId: modelIdOf(role),
        source: stored === null ? ("environment" as const) : ("staff" as const),
        editable: true,
      })),
      ...FIXED_ROLES.flatMap((role) => {
        const modelId = args.env[MODEL_ROLES[role].envKey];
        return modelId === undefined ? [] : [{ role, modelId, source: "environment" as const, editable: false }];
      }),
    ];
    const models: ModelCatalogEntry[] = Object.entries(prices)
      // Fake models are priced for the offline ledger only; no role can be pointed at them.
      .filter(([modelId]) => !modelId.startsWith("fake/"))
      .map(([modelId, price]) => ({
        modelId,
        ...price,
        source: staffPriced.has(modelId) ? ("staff" as const) : ("code" as const),
        available: args.aiMode === "fake" || args.isConfigured(parseModelId(modelId).provider),
      }))
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
    return { aiMode: args.aiMode, roles, models, updatedAt: stored?.updatedAt ?? null };
  };

  return {
    modelIdOf: (role) => {
      touch();
      return modelIdOf(role);
    },
    prices: () => {
      touch();
      return prices;
    },
    view: async () => {
      adopt(await args.store.get());
      return view();
    },
    update: async (input, actorId) => {
      const refusal = refusalOf(args, input);
      if (refusal !== null) return { ok: false, error: refusal };
      const next = { ...input, updatedAt: now().toISOString() };
      await args.store.save({ ...next, actorId });
      adopt(next);
      return { ok: true, data: view() };
    },
    refresh,
  };
};
