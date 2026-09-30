import type {
  EmbeddingModelV4,
  LanguageModelV4,
  SharedV4ProviderOptions,
  SpeechModelV4,
  TranscriptionModelV4,
} from "@ai-sdk/provider";
import { defaultEmbeddingSettingsMiddleware, wrapEmbeddingModel } from "ai";
import { type AgentEnvInput, type AgentRuntimeFlags, FAKE_MODE_APP_ENVS } from "../runtime/agent-env.schema.ts";
import { createFakeEmbeddingModel, FAKE_EMBEDDING_MODEL_ID } from "./fake/fake-embedding-model.ts";
import { createFakeLanguageModel } from "./fake/fake-language-model.ts";
import { createFakeScenarioRegistry, type FakeScenarioRegistry, type FakeScenarioRule } from "./fake/fake-scenarios.ts";
import { createFakeSpeechModel, createFakeTranscriptionModel } from "./fake/fake-voice-models.ts";
import { EMBEDDING_DIMENSIONS, MODEL_ROLES, type ModelProvider, parseModelId } from "./model-roles.ts";
import { createProviderRegistry, type ProviderEnv, type ProviderFactories, type ProviderRegistry } from "./provider-registry.ts";

/** Roles served by language models (voice and embedding have their own accessors). */
export type TextModelRole = "chat" | "fast" | "reasoning" | "judge";

type ModelEnvKeys =
  | `AI_MODEL_${"CHAT" | "FAST" | "REASONING" | "JUDGE" | "EMBEDDING" | "TRANSCRIPTION" | "SPEECH"}`
  | `AI_MODEL_${"CHAT" | "FAST" | "REASONING" | "JUDGE" | "EMBEDDING"}_FALLBACK`;

export type ModelFactoryEnv = AgentRuntimeFlags &
  ProviderEnv &
  Pick<AgentEnvInput, Exclude<ModelEnvKeys, `${string}_FALLBACK`>> &
  Partial<Pick<AgentEnvInput, Extract<ModelEnvKeys, `${string}_FALLBACK`>>>;

export type AgentModels = {
  readonly mode: AgentRuntimeFlags["AI_MODE"];
  /** Primary model of a role; `agentId` selects the fake keyword rules. */
  readonly language: (role: TextModelRole, options?: { agentId?: string }) => LanguageModelV4;
  /** Configured `AI_MODEL_<ROLE>_FALLBACK` models, in order (empty in fake mode). */
  readonly languageFallbacks: (role: TextModelRole) => LanguageModelV4[];
  /** Embedding model, pinned to 1536 dimensions (decision 0022). */
  readonly embedding: () => EmbeddingModelV4;
  /** Options every embedding call must carry (already applied by `embedding()`). */
  readonly embeddingProviderOptions: SharedV4ProviderOptions;
  /** `null` when the provider key is missing: the voice feature is off. */
  readonly transcription: () => TranscriptionModelV4 | null;
  readonly speech: () => SpeechModelV4 | null;
  /** Registers a fake keyword rule for an agent; a no-op in real mode. */
  readonly registerFakeScenario: (agentId: string, rule: FakeScenarioRule) => void;
};

export type CreateModelProviderOptions = {
  readonly providerFactories?: ProviderFactories;
  readonly scenarios?: FakeScenarioRegistry;
};

/** Fake models outside local/dev: the env check was bypassed (defence in depth, decision 0021). */
export class FakeModeNotAllowedError extends Error {
  readonly code = "FAKE_MODE_NOT_ALLOWED";
  readonly appEnv: AgentRuntimeFlags["APP_ENV"];

  constructor(appEnv: AgentRuntimeFlags["APP_ENV"]) {
    super(`AI_MODE=fake is not allowed in APP_ENV=${appEnv}`);
    this.name = "FakeModeNotAllowedError";
    this.appEnv = appEnv;
  }
}

const EMBEDDING_PROVIDER_OPTIONS: SharedV4ProviderOptions = {
  google: { outputDimensionality: EMBEDDING_DIMENSIONS },
  openai: { dimensions: EMBEDDING_DIMENSIONS },
};

const embeddingOptionsFor = (provider: ModelProvider): SharedV4ProviderOptions => {
  const options = EMBEDDING_PROVIDER_OPTIONS[provider];
  return options === undefined ? {} : { [provider]: options };
};

const createFakeModels = (scenarios: FakeScenarioRegistry): AgentModels => ({
  mode: "fake",
  language: (role, options) =>
    createFakeLanguageModel({ modelId: `fake-${role}`, registry: scenarios, ...(options?.agentId === undefined ? {} : { agentId: options.agentId }) }),
  languageFallbacks: () => [],
  embedding: () => createFakeEmbeddingModel(),
  embeddingProviderOptions: {},
  transcription: () => createFakeTranscriptionModel(),
  speech: () => createFakeSpeechModel(),
  registerFakeScenario: (agentId, rule) => scenarios.register(agentId, rule),
});

const languageModelOf = (registry: ProviderRegistry, modelId: string): LanguageModelV4 => {
  const { provider, model } = parseModelId(modelId);
  return registry.get(provider).languageModel(model);
};

const voiceModelOf = <TModel>(
  registry: ProviderRegistry,
  modelId: string,
  build: (provider: ReturnType<ProviderRegistry["get"]>, model: string) => TModel | undefined,
): TModel | null => {
  const { provider, model } = parseModelId(modelId);
  if (!registry.isConfigured(provider)) return null;
  return build(registry.get(provider), model) ?? null;
};

const createRealModels = (env: ModelFactoryEnv, registry: ProviderRegistry): AgentModels => {
  const embeddingModelId = env[MODEL_ROLES.embedding.envKey];
  const embeddingProvider = parseModelId(embeddingModelId).provider;
  const embeddingProviderOptions = embeddingOptionsFor(embeddingProvider);
  return {
    mode: "real",
    language: (role) => languageModelOf(registry, env[MODEL_ROLES[role].envKey]),
    languageFallbacks: (role) => {
      const fallback = env[MODEL_ROLES[role].fallbackEnvKey];
      return fallback === undefined ? [] : [languageModelOf(registry, fallback)];
    },
    embedding: () => {
      const model = registry.get(embeddingProvider).embeddingModel(parseModelId(embeddingModelId).model);
      return wrapEmbeddingModel({
        model,
        middleware: defaultEmbeddingSettingsMiddleware({ settings: { providerOptions: embeddingProviderOptions } }),
      });
    },
    embeddingProviderOptions,
    transcription: () =>
      voiceModelOf(registry, env[MODEL_ROLES.transcription.envKey], (provider, model) => provider.transcriptionModel?.(model)),
    speech: () => voiceModelOf(registry, env[MODEL_ROLES.speech.envKey], (provider, model) => provider.speechModel?.(model)),
    registerFakeScenario: () => undefined,
  };
};

/**
 * Model access for agents, processors, memory and voice (spec §5, decision 0021).
 * Fake mode builds only the deterministic fakes; real mode builds AI SDK
 * providers lazily with keys from the validated env.
 * @throws {FakeModeNotAllowedError} for `AI_MODE=fake` outside local/dev.
 */
export const createModelProvider = (env: ModelFactoryEnv, options: CreateModelProviderOptions = {}): AgentModels => {
  if (env.AI_MODE === "real") return createRealModels(env, createProviderRegistry(env, options.providerFactories));
  if (!FAKE_MODE_APP_ENVS.has(env.APP_ENV)) throw new FakeModeNotAllowedError(env.APP_ENV);
  return createFakeModels(options.scenarios ?? createFakeScenarioRegistry());
};

/**
 * Model id stored with (and searched against) knowledge vectors: `AI_MODEL_EMBEDDING`
 * in real mode, `fake/fake-embedding` in fake mode, so switching `AI_MODE` never
 * compares vectors of two embedding spaces.
 */
export const embeddingModelIdOf = (env: Pick<ModelFactoryEnv, "AI_MODE" | "AI_MODEL_EMBEDDING">): string =>
  env.AI_MODE === "fake" ? FAKE_EMBEDDING_MODEL_ID : env.AI_MODEL_EMBEDDING;
