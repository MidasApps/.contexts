import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  type InputProcessor,
  ModerationProcessor,
  type OutputProcessor,
  PIIDetector,
  type ProcessInputArgs,
  PromptInjectionDetector,
  RegexFilterProcessor,
  SystemPromptScrubber,
  TokenCostControl,
  TokenLimiterProcessor,
  UnicodeNormalizer,
} from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
import { readAgentContext } from "../context/agent-request-context.ts";
import type { AgentModels } from "../models/model-factory.ts";
import type { AgentRuntimePorts } from "../runtime/runtime-ports.ts";
import { createTenantBudgetGuard } from "./tenant-budget-guard.ts";

/**
 * Guardrail profile of the agents (SP3 spec §12, decision 0026).
 *
 * `TOKEN_COST_CONTROL_ENABLED` records the SP3 Task 16 evaluation of Mastra's
 * `TokenCostControl` (a soft daily signal next to the own hard cap):
 * - probe (2026-09-30, `@mastra/pg` 1.27.1, local Postgres 18): with
 *   `PostgresStoreVNext` the cost metrics are recorded and `TokenCostControl`
 *   (`scope: 'organization'`) tripped on the second run, so metrics work;
 * - it stays off because turning it on means swapping the Mastra storage to
 *   `PostgresStoreVNext` with its own observability connection and schema,
 *   DDL for its signal tables in `db:init`, and Mastra's own price table
 *   (which does not price every model of `model-prices.ts`); Mastra documents
 *   that store for low-volume production only. The hard cap (tenant budget
 *   guard) and the 80 % alert already come from the own ledger.
 */
export const TOKEN_COST_CONTROL_ENABLED = false;

/** Input tokens kept per call (`TokenLimiterProcessor`, best-fit trimming of history). */
export const INPUT_TOKEN_LIMIT = 60_000;
export const PROMPT_INJECTION_THRESHOLD = 0.8;
/** Soft daily signal of `TokenCostControl` (USD), only when the flag is on. */
export const DAILY_SOFT_CAP_USD = 5;
export const TENANT_PII_DETECTOR_ID = "tenant-pii-detector";
export const SYSTEM_PROMPT_SCRUBBER_RESULT_ID = "system-prompt-scrubber-result";

/**
 * `entry`: agents a caller reaches directly (every agent until the supervisor of
 * Task 20 is the only entry point): all detectors. `delegated`: subagents that
 * only receive supervisor-generated prompts (spec §12: detectors run on the
 * supervisor only).
 */
export type GuardrailProfileKind = "entry" | "delegated";

export type GuardrailProfile = {
  readonly inputProcessors: InputProcessor[];
  readonly outputProcessors: OutputProcessor[];
};

export type GuardrailProfileDeps = {
  readonly models: Pick<AgentModels, "language">;
  readonly ports: Pick<AgentRuntimePorts, "usage" | "settings">;
};

type PiiMode = "warn" | "redact";

// Settings unreachable → redact (the stricter mode), never skip the detector.
const piiModeOf = async (settings: AgentRuntimePorts["settings"], requestContext: RequestContext | undefined): Promise<PiiMode> => {
  const context = readAgentContext(requestContext);
  if (!context.ok) return "redact";
  try {
    return (await settings.getAgentSettings({ tenantId: context.data.context.tenantId })).guardrails.pii;
  } catch {
    return "redact";
  }
};

/** `PIIDetector` in the tenant's mode (`agent-settings.guardrails.pii`: warn by default, or redact). */
const createTenantPiiDetector = (settings: AgentRuntimePorts["settings"], model: LanguageModelV4): InputProcessor => {
  const detectors: Record<PiiMode, PIIDetector> = {
    warn: new PIIDetector({ model, strategy: "warn", lastMessageOnly: true, errorStrategy: "strict" }),
    redact: new PIIDetector({ model, strategy: "redact", lastMessageOnly: true, errorStrategy: "strict" }),
  };
  return {
    id: TENANT_PII_DETECTOR_ID,
    name: "Tenant PII detector",
    processInput: async (args: ProcessInputArgs) => detectors[await piiModeOf(settings, args.requestContext)].processInput(args),
  };
};

/**
 * The LLM scrubber checks the final answer only: on the stream it would call the
 * model once per text delta. Secret-shaped strings are still redacted on the
 * stream by the regex filter.
 */
const createResultScrubber = (model: LanguageModelV4): OutputProcessor => {
  const scrubber = new SystemPromptScrubber({ model, strategy: "redact", errorStrategy: "strict" });
  return { id: SYSTEM_PROMPT_SCRUBBER_RESULT_ID, name: "System prompt scrubber (final answer)", processOutputResult: (args) => scrubber.processOutputResult(args) };
};

const secretFilter = (): RegexFilterProcessor => new RegexFilterProcessor({ presets: ["secrets"], strategy: "redact", phase: "output" });

const costSignal = (): InputProcessor[] =>
  TOKEN_COST_CONTROL_ENABLED
    ? [new TokenCostControl({ maxCost: DAILY_SOFT_CAP_USD, scope: "organization", window: "24h", strategy: "warn", warnAtPercent: 80 })]
    : [];

/**
 * Processor stacks of an agent (spec §12). Order: normalize → hard budget cap
 * (before any detector spends tokens) → injection → moderation → PII → token
 * limit. LLM detectors use the `fast` role with `errorStrategy: 'strict'`, so a
 * detector failure trips the run instead of letting it through.
 */
export const createGuardrailProfile = (deps: GuardrailProfileDeps, kind: GuardrailProfileKind): GuardrailProfile => {
  const budgetGuard = createTenantBudgetGuard({ usage: deps.ports.usage });
  const tokenLimiter = new TokenLimiterProcessor({ limit: INPUT_TOKEN_LIMIT, trimMode: "best-fit" });
  if (kind === "delegated") return { inputProcessors: [new UnicodeNormalizer(), budgetGuard, tokenLimiter], outputProcessors: [secretFilter()] };
  const detector = deps.models.language("fast", { agentId: "guardrails" });
  return {
    inputProcessors: [
      new UnicodeNormalizer(),
      budgetGuard,
      new PromptInjectionDetector({ model: detector, strategy: "block", threshold: PROMPT_INJECTION_THRESHOLD, errorStrategy: "strict" }),
      new ModerationProcessor({ model: detector, strategy: "block", errorStrategy: "strict" }),
      createTenantPiiDetector(deps.ports.settings, detector),
      tokenLimiter,
      ...costSignal(),
    ],
    outputProcessors: [createResultScrubber(detector), secretFilter()],
  };
};
