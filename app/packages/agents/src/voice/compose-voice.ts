import type { Logger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { ApiRoute } from "@mastra/core/server";
import type { AgentModels } from "../models/model-factory.ts";
import { parseModelId } from "../models/model-roles.ts";
import type { AgentRuntimePorts } from "../runtime/runtime-ports.ts";
import { type CoreVoice, createVoice } from "./create-voice.ts";
import { createOpenAiRealtimeMinter, type RealtimeMinter } from "./realtime-session.ts";
import { createVoiceGovernance } from "./voice-governance.ts";
import { createVoiceRoutes } from "./voice-routes.ts";

/** Env the voice composition reads (decision 0034). */
export type VoiceEnv = {
  readonly APP_ENV: "local" | "dev" | "staging" | "prod";
  /** Realtime model `<provider>/<model>`; without it realtime stays off. */
  readonly AI_MODEL_REALTIME?: string;
  readonly OPENAI_API_KEY?: string | undefined;
  /** Unset: on in local only (the resolved agent env always sets it). */
  readonly AI_VOICE_ENABLED?: boolean;
  readonly AI_VOICE_REALTIME_ENABLED?: boolean;
};

// Agent instructions may be a string, a system message or a list of them.
const textOf = (instructions: unknown): string => {
  if (typeof instructions === "string") return instructions;
  if (Array.isArray(instructions)) return (instructions as unknown[]).map(textOf).filter((text) => text !== "").join("\n");
  if (typeof instructions !== "object" || instructions === null || !("content" in instructions)) return "";
  return typeof instructions.content === "string" ? instructions.content : "";
};

/** Realtime only when the flag is on, voice is on, the mode is real and the provider is OpenAI with a key. */
const realtimeMinterOf = (args: { env: VoiceEnv; enabled: boolean; models: AgentModels; supervisor: Agent | undefined }): RealtimeMinter | undefined => {
  const { env } = args;
  if (env.AI_MODEL_REALTIME === undefined) return undefined;
  const { provider, model } = parseModelId(env.AI_MODEL_REALTIME);
  if (!args.enabled || env.AI_VOICE_REALTIME_ENABLED !== true || args.models.mode !== "real" || provider !== "openai" || env.OPENAI_API_KEY === undefined) return undefined;
  const supervisor = args.supervisor;
  if (supervisor === undefined) return undefined;
  return createOpenAiRealtimeMinter({
    apiKey: env.OPENAI_API_KEY,
    model,
    instructions: async (requestContext: RequestContext<unknown> | undefined) => textOf(await supervisor.getInstructions(requestContext === undefined ? {} : { requestContext })),
  });
};

/**
 * Voice of the runtime and its routes (SP3 Task 26, SP4 Task 7): the platform flag, the tenant
 * budget, the usage ledger and the audit trail wrap every provider call (decision 0034).
 */
export const composeVoice = (args: {
  readonly env: VoiceEnv;
  readonly models: AgentModels;
  readonly ports: Pick<AgentRuntimePorts, "usage" | "audit">;
  readonly supervisor: Agent | undefined;
  readonly logger: Logger;
}): { readonly voice: CoreVoice | null; readonly routes: ApiRoute[] } => {
  const voice = createVoice({ models: args.models });
  const enabled = args.env.AI_VOICE_ENABLED ?? args.env.APP_ENV === "local";
  const governance = createVoiceGovernance({ enabled, usage: args.ports.usage, audit: args.ports.audit, logger: args.logger });
  const realtime = realtimeMinterOf({ env: args.env, enabled, models: args.models, supervisor: args.supervisor });
  return { voice, routes: createVoiceRoutes({ voice, logger: args.logger, governance, ...(realtime === undefined ? {} : { realtime }) }) };
};
