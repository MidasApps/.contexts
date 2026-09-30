import { z } from "zod";
import { defineContract } from "../contract.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });
const count = (description: string) => z.int().nonnegative().meta(none(description));

/**
 * One model call of the usage ledger (`usage.llm_calls`, SP3 spec §12, decision 0026).
 * `cost_micro_usd` is `bigint` in Postgres; on the wire it is a safe integer (JSON has no bigint).
 */
export const LlmCallSchema = z.strictObject({
  id: z.uuid().brand<"LlmCallId">().meta(none("Ledger row id (uuidv7).")),
  requestId: z.string().min(1).max(64).nullable().meta(none("X-Request-Id of the call that triggered the model, when known.")),
  traceId: z.string().regex(/^[0-9a-f]{32}$/).nullable().meta(none("W3C trace id of the run.")),
  tenantId: TenantIdSchema.meta(none("Organization billed for the call.")),
  userId: UserIdSchema.nullable().meta({ description: "Uid of the caller; null for platform jobs.", pii: "personal" }),
  agentId: z.string().min(1).max(200).meta(none("Agent, workflow or processor that called the model.")),
  provider: z.string().min(1).max(100).meta(none("Model provider, e.g. google.")),
  model: z.string().min(1).max(200).meta(none("Provider model id.")),
  inputTokens: count("Prompt tokens."),
  outputTokens: count("Completion tokens."),
  cachedTokens: count("Prompt tokens served from the provider cache."),
  costMicroUsd: z.int().nonnegative().nullable().meta(none("Cost in micro-USD from the price table; null when the price is unknown.")),
  latencyMs: count("Wall time of the call in milliseconds."),
  finishReason: z.string().max(64).nullable().meta(none("Why generation stopped, as the provider reported it.")),
  occurredAt: IsoDateTimeSchema.meta(none("When the call finished (UTC).")),
});
export type LlmCall = z.infer<typeof LlmCallSchema>;

export const LlmCallContract = defineContract(LlmCallSchema, {
  id: "usage.LlmCall",
  kind: "view",
  description: "A model call recorded in the usage ledger with tokens, cost and latency, per organization.",
  examples: [
    {
      id: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      userId: "uA1b2C3d4E5f6G7h8I9j",
      agentId: "assistant",
      provider: "google",
      model: "gemini-3.5-flash",
      inputTokens: 1200,
      outputTokens: 350,
      cachedTokens: 0,
      costMicroUsd: 4950,
      latencyMs: 820,
      finishReason: "stop",
      occurredAt: "2026-09-29T14:30:00.000Z",
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.usage.read",
});
