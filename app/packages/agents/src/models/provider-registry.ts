import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderV4 } from "@ai-sdk/provider";
import type { AgentEnvInput } from "../runtime/agent-env.schema.ts";
import type { ModelProvider } from "./model-roles.ts";

/** Provider credentials taken from the validated env (never `process.env`). */
export type ProviderSettings =
  | { readonly backend: "ai-studio"; readonly apiKey: string }
  | { readonly backend: "vertex"; readonly project: string; readonly location: string }
  | { readonly apiKey: string };

/** Builds an AI SDK provider instance; injectable so tests never hit the network. */
export type ProviderFactories = Readonly<Record<ModelProvider, (settings: ProviderSettings) => ProviderV4>>;

export type ProviderEnv = Pick<
  AgentEnvInput,
  | "GOOGLE_AI_BACKEND"
  | "GOOGLE_GENERATIVE_AI_API_KEY"
  | "GOOGLE_VERTEX_PROJECT"
  | "GOOGLE_VERTEX_LOCATION"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
>;

/** A provider was requested without the variables it needs (the env schema should have refused the boot). */
export class ModelProviderConfigError extends Error {
  readonly code = "MODEL_PROVIDER_NOT_CONFIGURED";
  readonly provider: ModelProvider;
  constructor(provider: ModelProvider) {
    super(`Model provider ${provider} is not configured.`);
    this.name = "ModelProviderConfigError";
    this.provider = provider;
  }
}

const withApiKey = (settings: ProviderSettings): string => {
  if ("apiKey" in settings) return settings.apiKey;
  throw new TypeError("expected an API key setting");
};

export const DEFAULT_PROVIDER_FACTORIES: ProviderFactories = {
  google: (settings) =>
    "backend" in settings && settings.backend === "vertex"
      ? createVertex({ project: settings.project, location: settings.location })
      : createGoogleGenerativeAI({ apiKey: withApiKey(settings) }),
  openai: (settings) => createOpenAI({ apiKey: withApiKey(settings) }),
  anthropic: (settings) => createAnthropic({ apiKey: withApiKey(settings) }),
};

/** Settings for a provider, or `undefined` when its variables are missing. */
export const providerSettingsFor = (env: ProviderEnv, provider: ModelProvider): ProviderSettings | undefined => {
  if (provider === "openai") return env.OPENAI_API_KEY === undefined ? undefined : { apiKey: env.OPENAI_API_KEY };
  if (provider === "anthropic")
    return env.ANTHROPIC_API_KEY === undefined ? undefined : { apiKey: env.ANTHROPIC_API_KEY };
  if (env.GOOGLE_AI_BACKEND === "vertex") {
    const { GOOGLE_VERTEX_PROJECT: project, GOOGLE_VERTEX_LOCATION: location } = env;
    return project === undefined || location === undefined ? undefined : { backend: "vertex", project, location };
  }
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  return apiKey === undefined ? undefined : { backend: "ai-studio", apiKey };
};

export type ProviderRegistry = {
  /** Whether the provider's variables are present (voice roles turn off when not). */
  readonly isConfigured: (provider: ModelProvider) => boolean;
  /**
   * The provider instance, built once on first use.
   * @throws {ModelProviderConfigError} when its variables are missing.
   */
  readonly get: (provider: ModelProvider) => ProviderV4;
};

export const createProviderRegistry = (
  env: ProviderEnv,
  factories: ProviderFactories = DEFAULT_PROVIDER_FACTORIES,
): ProviderRegistry => {
  const built = new Map<ModelProvider, ProviderV4>();
  return {
    isConfigured: (provider) => providerSettingsFor(env, provider) !== undefined,
    get: (provider) => {
      const existing = built.get(provider);
      if (existing !== undefined) return existing;
      const settings = providerSettingsFor(env, provider);
      if (settings === undefined) throw new ModelProviderConfigError(provider);
      const instance = factories[provider](settings);
      built.set(provider, instance);
      return instance;
    },
  };
};
