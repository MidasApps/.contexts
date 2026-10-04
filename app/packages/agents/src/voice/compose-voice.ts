import type { Logger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { ApiRoute } from "@mastra/core/server";
import type { AgentModels } from "../models/model-factory.ts";
import { parseModelId } from "../models/model-roles.ts";
import { CORE_FLAG_KEYS } from "../runtime/core-flag-keys.ts";
import type { FlagReader } from "../runtime/flag-reader.ts";
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
  /**
   * Environment defaults of the flags `chat.voice` and `chat.voice.realtime` (decision 0034
   * amendment): `apps/mastra` passes them to the flags binding; the gate itself is the flag.
   */
  readonly AI_VOICE_ENABLED?: boolean;
  readonly AI_VOICE_REALTIME_ENABLED?: boolean;
};

// Agent instructions may be a string, a system message or a list of them.
const textOf = (instructions: unknown): string => {
  if (typeof instructions === "string") return instructions;
  if (Array.isArray(instructions))
    return (instructions as unknown[])
      .map(textOf)
      .filter((text) => text !== "")
      .join("\n");
  if (typeof instructions !== "object" || instructions === null || !("content" in instructions)) return "";
  return typeof instructions.content === "string" ? instructions.content : "";
};

/** A minter only in real mode with an OpenAI realtime model and key; each call also needs both voice flags. */
const realtimeMinterOf = (args: {
  env: VoiceEnv;
  models: AgentModels;
  supervisor: Agent | undefined;
}): RealtimeMinter | undefined => {
  const { env } = args;
  if (env.AI_MODEL_REALTIME === undefined) return undefined;
  const { provider, model } = parseModelId(env.AI_MODEL_REALTIME);
  if (args.models.mode !== "real" || provider !== "openai" || env.OPENAI_API_KEY === undefined) return undefined;
  const supervisor = args.supervisor;
  if (supervisor === undefined) return undefined;
  return createOpenAiRealtimeMinter({
    apiKey: env.OPENAI_API_KEY,
    model,
    instructions: async (requestContext: RequestContext<unknown> | undefined) =>
      textOf(await supervisor.getInstructions(requestContext === undefined ? {} : { requestContext })),
  });
};

/**
 * Voice of the runtime and its routes (SP3 Task 26, SP4 Task 7): the per-tenant voice flags, the tenant
 * budget, the usage ledger and the audit trail wrap every provider call (decision 0034).
 */
export const composeVoice = (args: {
  readonly env: VoiceEnv;
  readonly models: AgentModels;
  readonly ports: Pick<AgentRuntimePorts, "usage" | "audit">;
  readonly flags: FlagReader;
  readonly supervisor: Agent | undefined;
  readonly logger: Logger;
}): { readonly voice: CoreVoice | null; readonly routes: ApiRoute[] } => {
  const voice = createVoice({ models: args.models });
  // Per tenant, cached 30 s; a store failure with nothing cached keeps voice off (fail closed).
  const isEnabled: Parameters<typeof createVoiceGovernance>[0]["isEnabled"] = ({ tenantId, feature }) =>
    args.flags.isEnabled({
      key: feature === "voice" ? CORE_FLAG_KEYS.voice : CORE_FLAG_KEYS.voiceRealtime,
      tenantId,
      fallback: false,
    });
  const governance = createVoiceGovernance({
    isEnabled,
    usage: args.ports.usage,
    audit: args.ports.audit,
    logger: args.logger,
  });
  const realtime = realtimeMinterOf({ env: args.env, models: args.models, supervisor: args.supervisor });
  return {
    voice,
    routes: createVoiceRoutes({
      voice,
      logger: args.logger,
      governance,
      ...(realtime === undefined ? {} : { realtime }),
    }),
  };
};
