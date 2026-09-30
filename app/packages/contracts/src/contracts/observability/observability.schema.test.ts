import { describe, expect, it } from "vitest";
import { MessageFeedbackContract, MessageFeedbackInputContract, MessageFeedbackInputSchema } from "../conversations/message-feedback.schema.ts";
import { ActivatePromptVersionInputContract, ActivatePromptVersionInputSchema, PromptActivationContract } from "../agents/prompt-activation.schema.ts";
import { CreatePromptVersionInputContract, PromptVersionContract, PromptVersionSchema } from "../agents/prompt-version.schema.ts";
import { UsageDailyRollupContract, UsageDailyRollupSchema } from "../usage/usage-daily-rollup.schema.ts";
import { EvalExperimentSummaryContract } from "./eval-experiment-summary.schema.ts";
import { TraceDetailContract, TraceDetailSchema } from "./trace-detail.schema.ts";
import { TraceSummaryContract, TraceSummarySchema } from "./trace-summary.schema.ts";

const contracts = [
  TraceSummaryContract,
  TraceDetailContract,
  EvalExperimentSummaryContract,
  UsageDailyRollupContract,
  MessageFeedbackContract,
  MessageFeedbackInputContract,
  PromptVersionContract,
  CreatePromptVersionInputContract,
  PromptActivationContract,
  ActivatePromptVersionInputContract,
];

describe("SP5 observability, usage, feedback and prompt contracts", () => {
  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: every example parses", (_id, contract) => {
    expect(contract.meta.examples.length).toBeGreaterThan(0);
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(contracts.map((contract) => [contract.id, contract] as const))("%s: rejects an unknown key", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), injected: true }).success).toBe(false);
  });
});

describe("traces", () => {
  it("uses 32-hex trace ids and non-negative token counts", () => {
    const [summary] = TraceSummaryContract.meta.examples as [Record<string, unknown>];
    expect(TraceSummarySchema.safeParse({ ...summary, traceId: "not-a-trace" }).success).toBe(false);
    expect(TraceSummarySchema.safeParse({ ...summary, inputTokens: -1 }).success).toBe(false);
  });

  it("marks span input and output as personal data", () => {
    const [detail] = TraceDetailContract.meta.examples as [{ spans: Record<string, unknown>[] } & Record<string, unknown>];
    expect(TraceDetailSchema.safeParse({ ...detail, spans: [{ ...detail.spans[0], spanId: "zz" }] }).success).toBe(false);
    expect(TraceDetailContract.meta.pii).toBe("personal");
  });
});

describe("usage daily rollup", () => {
  it("uses a calendar day and integer micro-USD", () => {
    const [rollup] = UsageDailyRollupContract.meta.examples as [Record<string, unknown>];
    expect(UsageDailyRollupSchema.safeParse({ ...rollup, day: "2026-9-1" }).success).toBe(false);
    expect(UsageDailyRollupSchema.safeParse({ ...rollup, costMicroUsd: 1.5 }).success).toBe(false);
  });
});

describe("feedback", () => {
  it("caps the comment at 1000 characters", () => {
    expect(MessageFeedbackInputSchema.safeParse({ messageId: "m1", rating: "down", comment: "x".repeat(1000) }).success).toBe(true);
    expect(MessageFeedbackInputSchema.safeParse({ messageId: "m1", rating: "down", comment: "x".repeat(1001) }).success).toBe(false);
    expect(MessageFeedbackInputSchema.safeParse({ messageId: "m1", rating: "meh" }).success).toBe(false);
  });
});

describe("prompts", () => {
  it("binds tenant scope to a tenant id and platform scope to none", () => {
    const [version] = PromptVersionContract.meta.examples as [Record<string, unknown>];
    expect(PromptVersionSchema.safeParse({ ...version, scope: "tenant", tenantId: null }).success).toBe(false);
    expect(PromptVersionSchema.safeParse({ ...version, scope: "platform", tenantId: "Jd8sK2lPq0WnR5tYu3bV" }).success).toBe(false);
    expect(PromptVersionSchema.safeParse({ ...version, version: 0 }).success).toBe(false);
  });

  it("requires a reason to force an activation", () => {
    const versionId = "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f";
    expect(ActivatePromptVersionInputSchema.safeParse({ versionId }).success).toBe(true);
    expect(ActivatePromptVersionInputSchema.safeParse({ versionId, force: true }).success).toBe(false);
    expect(ActivatePromptVersionInputSchema.safeParse({ versionId, force: true, reason: "Eval dataset is being rebuilt." }).success).toBe(true);
  });
});
