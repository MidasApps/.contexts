/**
 * Model roles (spec §5.1, decision 0021). Each role reads its model id from
 * `AI_MODEL_<ROLE>` (optional `AI_MODEL_<ROLE>_FALLBACK`); ids live in config
 * only. Voice roles are optional at boot: a missing key turns the feature off.
 */
export const MODEL_PROVIDERS = ["google", "openai", "anthropic"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export type ModelModality = "text" | "embedding" | "voice";

export type ModelRoleSpec = {
  envKey: `AI_MODEL_${string}`;
  fallbackEnvKey: `AI_MODEL_${string}_FALLBACK`;
  defaultModel: `${ModelProvider}/${string}`;
  modality: ModelModality;
};

export const MODEL_ROLES = {
  // Supervisor and subagents.
  chat: {
    envKey: "AI_MODEL_CHAT",
    fallbackEnvKey: "AI_MODEL_CHAT_FALLBACK",
    defaultModel: "google/gemini-3.5-flash",
    modality: "text",
  },
  // Titles, summaries and LLM guardrail detectors.
  fast: {
    envKey: "AI_MODEL_FAST",
    fallbackEnvKey: "AI_MODEL_FAST_FALLBACK",
    defaultModel: "google/gemini-3.5-flash-lite",
    modality: "text",
  },
  // Action-agent planning; tenants may override it with a stronger model.
  reasoning: {
    envKey: "AI_MODEL_REASONING",
    fallbackEnvKey: "AI_MODEL_REASONING_FALLBACK",
    defaultModel: "google/gemini-3.5-flash",
    modality: "text",
  },
  // LLM-judge scorers (real-mode evals only).
  judge: {
    envKey: "AI_MODEL_JUDGE",
    fallbackEnvKey: "AI_MODEL_JUDGE_FALLBACK",
    defaultModel: "google/gemini-3.5-flash",
    modality: "text",
  },
  // Knowledge base and memory recall; 1536 dimensions (decision 0022).
  embedding: {
    envKey: "AI_MODEL_EMBEDDING",
    fallbackEnvKey: "AI_MODEL_EMBEDDING_FALLBACK",
    defaultModel: "google/gemini-embedding-001",
    modality: "embedding",
  },
  transcription: {
    envKey: "AI_MODEL_TRANSCRIPTION",
    fallbackEnvKey: "AI_MODEL_TRANSCRIPTION_FALLBACK",
    defaultModel: "openai/gpt-transcribe",
    modality: "voice",
  },
  speech: {
    envKey: "AI_MODEL_SPEECH",
    fallbackEnvKey: "AI_MODEL_SPEECH_FALLBACK",
    defaultModel: "openai/gpt-4o-mini-tts",
    modality: "voice",
  },
  realtime: {
    envKey: "AI_MODEL_REALTIME",
    fallbackEnvKey: "AI_MODEL_REALTIME_FALLBACK",
    defaultModel: "openai/gpt-realtime-2.1",
    modality: "voice",
  },
} as const satisfies Record<string, ModelRoleSpec>;

export type ModelRole = keyof typeof MODEL_ROLES;

/** Roles in declaration order (typed `Object.keys`). */
export const MODEL_ROLE_NAMES = Object.keys(MODEL_ROLES) as ModelRole[];

/** `<provider>/<model>`; the provider must be one the model factory can build. */
export const MODEL_ID_PATTERN = new RegExp(`^(${MODEL_PROVIDERS.join("|")})/[\\w.:-]+$`);

/**
 * Splits a validated model id.
 * @param modelId a value that matched `MODEL_ID_PATTERN` (env schema).
 */
export const parseModelId = (modelId: string): { provider: ModelProvider; model: string } => {
  const separator = modelId.indexOf("/");
  return { provider: modelId.slice(0, separator) as ModelProvider, model: modelId.slice(separator + 1) };
};

/** One embedding dimension for v1 (`vector(1536)`, decision 0022); a change means `ai.chunks_v2`. */
export const EMBEDDING_DIMENSIONS = 1536;
