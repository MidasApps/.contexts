import { type EnvIssue, InvalidEnvError } from "@core/services";
import { z } from "zod";
import { MODEL_ID_PATTERN, MODEL_ROLE_NAMES, MODEL_ROLES, parseModelId } from "../models/model-roles.ts";

/**
 * Env of the agent runtime (spec §5, §15; decision 0021). Apps compose it with
 * the services env (`loadServicesEnvWith`) and then call `resolveAgentEnv`,
 * which applies the rules that depend on `APP_ENV` and `AI_MODE`.
 */

// `.env` files write unset values as `KEY=`; an empty string means "not set".
const optionalValue = <TSchema extends z.ZodType>(schema: TSchema) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

// Boolean env values are the literal strings "true"/"false"; anything else is a typo.
const booleanFlag = (fallback: boolean) =>
  z.enum(["true", "false"]).transform((value) => value === "true").default(fallback);

const ModelIdSchema = z.string().regex(MODEL_ID_PATTERN, { error: "expected <provider>/<model>" });
const modelRole = (role: keyof typeof MODEL_ROLES) => ModelIdSchema.default(MODEL_ROLES[role].defaultModel);
const fallbackModel = () => optionalValue(ModelIdSchema);

export const AgentEnvSchema = z.object({
  AI_MODEL_CHAT: modelRole("chat"),
  AI_MODEL_CHAT_FALLBACK: fallbackModel(),
  AI_MODEL_FAST: modelRole("fast"),
  AI_MODEL_FAST_FALLBACK: fallbackModel(),
  AI_MODEL_REASONING: modelRole("reasoning"),
  AI_MODEL_REASONING_FALLBACK: fallbackModel(),
  AI_MODEL_JUDGE: modelRole("judge"),
  AI_MODEL_JUDGE_FALLBACK: fallbackModel(),
  AI_MODEL_EMBEDDING: modelRole("embedding"),
  AI_MODEL_EMBEDDING_FALLBACK: fallbackModel(),
  AI_MODEL_TRANSCRIPTION: modelRole("transcription"),
  AI_MODEL_TRANSCRIPTION_FALLBACK: fallbackModel(),
  AI_MODEL_SPEECH: modelRole("speech"),
  AI_MODEL_SPEECH_FALLBACK: fallbackModel(),
  AI_MODEL_REALTIME: modelRole("realtime"),
  AI_MODEL_REALTIME_FALLBACK: fallbackModel(),
  // ai-studio: API key (local/dev); vertex: ADC with project and location (remote).
  GOOGLE_AI_BACKEND: z.enum(["ai-studio", "vertex"]).default("ai-studio"),
  GOOGLE_VERTEX_PROJECT: optionalValue(z.string().min(1)),
  GOOGLE_VERTEX_LOCATION: optionalValue(z.string().min(1)),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalValue(z.string().min(1)),
  OPENAI_API_KEY: optionalValue(z.string().min(1)),
  ANTHROPIC_API_KEY: optionalValue(z.string().min(1)),
  FIRECRAWL_API_KEY: optionalValue(z.string().min(1)),
  FIRECRAWL_API_URL: optionalValue(z.url({ protocol: /^https?$/ })),
  // Observational Memory stays off until its comparative eval (decision 0029).
  AI_MEMORY_OBSERVATIONAL: booleanFlag(false),
  AI_KB_RERANK: booleanFlag(false),
  // MCPServer requestState key; local gets a fixed non-secret default.
  MCP_REQUEST_STATE_KEY: optionalValue(z.string().min(1)),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalValue(z.url({ protocol: /^https?$/ })),
  MASTRA_PUBSUB: z.enum(["memory", "gcp"]).default("memory"),
  // Unset: `auto` in local, `skip` elsewhere (decision 0023).
  MASTRA_STORAGE_INIT: optionalValue(z.enum(["auto", "skip"])),
  USAGE_SINK: z.enum(["none", "bigquery"]).default("none"),
  BIGQUERY_DATASET_AI_OBSERVABILITY: z
    .string()
    .regex(/^\w{1,1024}$/, { error: "expected a BigQuery dataset id" })
    .default("ai_observability"),
});

export type AgentEnvInput = z.infer<typeof AgentEnvSchema>;

/** Services-env values the agent rules depend on. */
export type AgentRuntimeFlags = {
  APP_ENV: "local" | "dev" | "staging" | "prod";
  AI_MODE: "real" | "fake";
};

type ResolvedKeys = "MCP_REQUEST_STATE_KEY" | "MASTRA_STORAGE_INIT";
export type AgentEnv = Omit<AgentEnvInput, ResolvedKeys> & {
  MCP_REQUEST_STATE_KEY: string;
  MASTRA_STORAGE_INIT: "auto" | "skip";
};

/** Local-only request state key: not a secret, only valid where APP_ENV=local. */
export const LOCAL_MCP_REQUEST_STATE_KEY = "local-only-mcp-request-state-key-not-a-secret";
const MIN_MCP_REQUEST_STATE_KEY_BYTES = 32;
/** The only APP_ENVs where `AI_MODE=fake` may run (decision 0021). */
export const FAKE_MODE_APP_ENVS: ReadonlySet<AgentRuntimeFlags["APP_ENV"]> = new Set(["local", "dev"]);

type ProviderKey =
  | "GOOGLE_GENERATIVE_AI_API_KEY"
  | "GOOGLE_VERTEX_PROJECT"
  | "GOOGLE_VERTEX_LOCATION"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY";
const PROVIDER_KEY_ORDER: readonly ProviderKey[] = [
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

/** Variables a model id needs in real mode (Google depends on the backend). */
export const providerKeysFor = (env: Pick<AgentEnvInput, "GOOGLE_AI_BACKEND">, modelId: string): ProviderKey[] => {
  const { provider } = parseModelId(modelId);
  if (provider === "openai") return ["OPENAI_API_KEY"];
  if (provider === "anthropic") return ["ANTHROPIC_API_KEY"];
  return env.GOOGLE_AI_BACKEND === "vertex"
    ? ["GOOGLE_VERTEX_PROJECT", "GOOGLE_VERTEX_LOCATION"]
    : ["GOOGLE_GENERATIVE_AI_API_KEY"];
};

// Text and embedding roles (and their fallbacks) must be servable at boot.
const bootModelIds = (env: AgentEnvInput): string[] =>
  MODEL_ROLE_NAMES.filter((role) => MODEL_ROLES[role].modality !== "voice").flatMap((role) => {
    const spec = MODEL_ROLES[role];
    const fallback = env[spec.fallbackEnvKey];
    return fallback === undefined ? [env[spec.envKey]] : [env[spec.envKey], fallback];
  });

const missingProviderKeys = (env: AgentEnvInput): EnvIssue[] => {
  const needed = new Set(bootModelIds(env).flatMap((modelId) => providerKeysFor(env, modelId)));
  return PROVIDER_KEY_ORDER.filter((key) => needed.has(key) && env[key] === undefined).map((field) => ({
    field,
    issue: "REQUIRED_IN_REAL_MODE",
  }));
};

const remoteOnlyIssues = (env: AgentEnvInput): EnvIssue[] => {
  const issues: EnvIssue[] = [];
  const stateKey = env.MCP_REQUEST_STATE_KEY;
  if (stateKey === undefined || Buffer.byteLength(stateKey) < MIN_MCP_REQUEST_STATE_KEY_BYTES) {
    issues.push({ field: "MCP_REQUEST_STATE_KEY", issue: "MIN_32_BYTES_OUTSIDE_LOCAL" });
  }
  // The runtime role has no DDL outside local; `db:init` creates Mastra's tables.
  if (env.MASTRA_STORAGE_INIT === "auto") issues.push({ field: "MASTRA_STORAGE_INIT", issue: "SKIP_OUTSIDE_LOCAL" });
  return issues;
};

/** Rules that depend on APP_ENV and AI_MODE; returns names and codes, never values. */
export const findAgentEnvIssues = (env: AgentEnvInput & AgentRuntimeFlags): EnvIssue[] => [
  ...(env.AI_MODE === "fake" && !FAKE_MODE_APP_ENVS.has(env.APP_ENV)
    ? [{ field: "AI_MODE", issue: "FAKE_ONLY_IN_LOCAL_OR_DEV" }]
    : []),
  ...(env.AI_MODE === "real" ? missingProviderKeys(env) : []),
  ...(env.APP_ENV === "local" ? [] : remoteOnlyIssues(env)),
];

/**
 * Applies the cross-variable rules and the env-dependent defaults.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const resolveAgentEnv = <TEnv extends AgentEnvInput & AgentRuntimeFlags>(
  env: TEnv,
): Omit<TEnv, ResolvedKeys> & AgentEnv => {
  const issues = findAgentEnvIssues(env);
  if (issues.length > 0) throw new InvalidEnvError(issues);
  return {
    ...env,
    MCP_REQUEST_STATE_KEY: env.MCP_REQUEST_STATE_KEY ?? LOCAL_MCP_REQUEST_STATE_KEY,
    MASTRA_STORAGE_INIT: env.MASTRA_STORAGE_INIT ?? (env.APP_ENV === "local" ? "auto" : "skip"),
  };
};
