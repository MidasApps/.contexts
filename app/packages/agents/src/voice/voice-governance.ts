import { type LlmCall, LlmCallSchema } from "@core/contracts";
import type { Logger } from "@core/services";
import type { RequestContext } from "@mastra/core/request-context";
import { readAgentContext } from "../context/agent-request-context.ts";
import { uuidv7 } from "../observability/uuidv7.ts";
import type { AccessPrincipal, AuditPort, UsagePort } from "../runtime/runtime-ports.ts";
import type { VoiceModelRef } from "./create-voice.ts";

/**
 * Governance of voice calls (SP3 follow-ups #29 and #30, decision 0034): `transcribe` and
 * `generateSpeech` produce no Mastra span, so the routes themselves gate the feature, check the
 * tenant budget before the provider call (fail-closed), and afterwards write a usage-ledger row
 * and an audit entry. Tokens are 0 and the cost is unknown (`null`): audio is not priced yet, so
 * the budget counts the call without a cost.
 */

export type VoiceCallKind = "transcription" | "speech";

/** The verified caller of a voice route, from the context middleware on `/voice/*`. */
export type VoiceCaller = {
  readonly tenantId: string;
  readonly principal: AccessPrincipal;
  readonly requestId: string;
};

export type VoiceRefusal = {
  readonly status: 403 | 429 | 503;
  readonly code: "FORBIDDEN" | "BUDGET_EXCEEDED" | "FEATURE_UNAVAILABLE";
};

/** Which voice feature a call needs: `voice` (flag `chat.voice`) or also `realtime` (`chat.voice.realtime`). */
export type VoiceFeature = "voice" | "realtime";

export type VoiceGovernance = {
  /**
   * The caller, or why the call may not start (no context, feature off for the tenant, budget).
   * `realtime` also needs the realtime flag.
   */
  readonly admit: (
    requestContext: RequestContext<unknown> | undefined,
    options?: { readonly realtime?: boolean },
  ) => Promise<
    { readonly ok: true; readonly caller: VoiceCaller } | { readonly ok: false; readonly refusal: VoiceRefusal }
  >;
  /** Ledger row and audit entry of a finished provider call; failures are logged, never thrown. */
  readonly record: (input: {
    readonly caller: VoiceCaller;
    readonly kind: VoiceCallKind;
    readonly model: VoiceModelRef | null;
    readonly latencyMs: number;
  }) => Promise<void>;
};

const AGENT_IDS: Record<VoiceCallKind, string> = { transcription: "voice-transcription", speech: "voice-speech" };
const AUDIT_ACTIONS: Record<VoiceCallKind, string> = {
  transcription: "VOICE_TRANSCRIBED",
  speech: "VOICE_SYNTHESIZED",
};

const userIdOf = (principal: AccessPrincipal): string | null =>
  principal.type === "user" ? principal.uid : principal.type === "service" ? principal.ownerUid : null;

const ledgerRowOf = (
  input: Parameters<VoiceGovernance["record"]>[0],
  now: Date,
  newId: () => string,
): LlmCall | null => {
  const parsed = LlmCallSchema.safeParse({
    id: newId(),
    requestId: input.caller.requestId.slice(0, 64),
    traceId: null,
    tenantId: input.caller.tenantId,
    userId: userIdOf(input.caller.principal),
    agentId: AGENT_IDS[input.kind],
    provider: input.model?.provider ?? "unknown",
    model: input.model?.modelId ?? "unknown",
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costMicroUsd: null,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    finishReason: null,
    occurredAt: now.toISOString(),
  });
  return parsed.success ? parsed.data : null;
};

type AdmitDeps = { readonly isEnabled: VoiceFeatureGate; readonly usage: Pick<UsagePort, "checkTenantBudget"> };

const UNAVAILABLE = { ok: false, refusal: { status: 503, code: "FEATURE_UNAVAILABLE" } } as const;

const featuresOn = async (deps: AdmitDeps, tenantId: string, realtime: boolean): Promise<boolean> =>
  (await deps.isEnabled({ tenantId, feature: "voice" })) &&
  (!realtime || (await deps.isEnabled({ tenantId, feature: "realtime" })));

const admitCaller = async (
  deps: AdmitDeps,
  requestContext: RequestContext<unknown> | undefined,
  options: { readonly realtime?: boolean } = {},
): ReturnType<VoiceGovernance["admit"]> => {
  const read = requestContext === undefined ? null : readAgentContext(requestContext);
  if (read === null || !read.ok) return { ok: false, refusal: { status: 403, code: "FORBIDDEN" } };
  const caller = {
    tenantId: read.data.context.tenantId,
    principal: read.data.principal,
    requestId: read.data.context.requestId,
  };
  if (!(await featuresOn(deps, caller.tenantId, options.realtime === true))) return UNAVAILABLE;
  try {
    const budget = await deps.usage.checkTenantBudget({ tenantId: caller.tenantId });
    return budget.allowed ? { ok: true, caller } : { ok: false, refusal: { status: 429, code: "BUDGET_EXCEEDED" } };
  } catch {
    // Fail-closed like the chat budget guard: no ledger, no provider call.
    return { ok: false, refusal: { status: 503, code: "FEATURE_UNAVAILABLE" } };
  }
};

/**
 * Per-tenant voice flags (decision 0039: `chat.voice`, `chat.voice.realtime`, read through the flag
 * reader; `AI_VOICE_ENABLED` only seeds the environment default, decision 0034 amendment).
 */
export type VoiceFeatureGate = (input: {
  readonly tenantId: string;
  readonly feature: VoiceFeature;
}) => Promise<boolean>;

export const createVoiceGovernance = (deps: {
  readonly isEnabled: VoiceFeatureGate;
  readonly usage: Pick<UsagePort, "recordLlmCalls" | "checkTenantBudget">;
  readonly audit: AuditPort;
  readonly logger: Logger;
  readonly now?: () => Date;
  readonly newId?: () => string;
}): VoiceGovernance => ({
  admit: (requestContext, options) => admitCaller(deps, requestContext, options),
  record: async (input) => {
    const row = ledgerRowOf(input, (deps.now ?? (() => new Date()))(), deps.newId ?? uuidv7);
    const { caller } = input;
    try {
      if (row === null)
        deps.logger.error("voice_ledger_row_invalid", { requestId: caller.requestId, kind: input.kind });
      else await deps.usage.recordLlmCalls([row]);
    } catch (error: unknown) {
      deps.logger.error("voice_ledger_write_failed", { requestId: caller.requestId, kind: input.kind, err: error });
    }
    try {
      await deps.audit.record({
        action: AUDIT_ACTIONS[input.kind],
        tenantId: caller.tenantId,
        actor: caller.principal,
        target: { type: "voice-call", id: row?.id ?? caller.requestId },
        metadata: { durationMs: Math.max(0, Math.round(input.latencyMs)) },
        requestId: caller.requestId,
      });
    } catch (error: unknown) {
      deps.logger.error("voice_audit_failed", { requestId: caller.requestId, kind: input.kind, err: error });
    }
  },
});
