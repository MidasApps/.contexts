import type { LanguageModelV4, LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import type { AgentModels, ModelFactoryEnv, TextModelRole } from "../models/model-factory.ts";
import { estimateCostMicroUsd } from "../models/model-prices.ts";

/** Tokens and cost of every model call of one comparison config (SP3 Task 28). */
export type ModelMeter = {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** `null` when a called model has no verified price (model-prices.ts). */
  readonly costMicroUsd: number | null;
  readonly callsByRole: Readonly<Record<string, number>>;
};

type MeterState = { calls: number; inputTokens: number; outputTokens: number; costMicroUsd: number | null; callsByRole: Record<string, number> };

const ROLE_ENV_KEY: Readonly<Record<TextModelRole, keyof ModelFactoryEnv>> = {
  chat: "AI_MODEL_CHAT",
  fast: "AI_MODEL_FAST",
  reasoning: "AI_MODEL_REASONING",
  judge: "AI_MODEL_JUDGE",
};

const record = (state: MeterState, role: string, modelId: string, usage: LanguageModelV4Usage): void => {
  const inputTokens = usage.inputTokens.total ?? 0;
  const outputTokens = usage.outputTokens.total ?? 0;
  state.calls += 1;
  state.inputTokens += inputTokens;
  state.outputTokens += outputTokens;
  state.callsByRole[role] = (state.callsByRole[role] ?? 0) + 1;
  const cost = estimateCostMicroUsd(modelId, { inputTokens, outputTokens });
  state.costMicroUsd = state.costMicroUsd === null || cost === null ? null : state.costMicroUsd + cost;
};

const meterModel = (model: LanguageModelV4, onUsage: (usage: LanguageModelV4Usage) => void, onPrompt: (prompt: string) => void): LanguageModelV4 => ({
  ...model,
  doGenerate: async (options) => {
    onPrompt(JSON.stringify(options.prompt));
    const result = await model.doGenerate(options);
    onUsage(result.usage);
    return result;
  },
  doStream: async (options) => {
    onPrompt(JSON.stringify(options.prompt));
    const result = await model.doStream(options);
    const tap = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
      transform: (part, controller) => {
        if (part.type === "finish") onUsage(part.usage);
        controller.enqueue(part);
      },
    });
    return { ...result, stream: result.stream.pipeThrough(tap) };
  },
});

/**
 * Wraps every text model of `models` so each call counts tokens and cost (priced by the
 * configured `AI_MODEL_<ROLE>` id; fake models are priced like the model they stand
 * for) and records the chat prompts, so the fake run can prove recall reached them.
 */
export const meterModels = (models: AgentModels, env: ModelFactoryEnv): { readonly models: AgentModels; readonly meter: () => ModelMeter; readonly chatPrompts: readonly string[] } => {
  const state: MeterState = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, callsByRole: {} };
  const chatPrompts: string[] = [];
  const language: AgentModels["language"] = (role, options) => {
    const modelId = String(env[ROLE_ENV_KEY[role]]);
    const onPrompt = (prompt: string) => (role === "chat" ? chatPrompts.push(prompt) : undefined);
    return meterModel(models.language(role, options), (usage) => record(state, role, modelId, usage), onPrompt);
  };
  return { models: { ...models, language }, meter: () => ({ ...state, callsByRole: { ...state.callsByRole } }), chatPrompts };
};
