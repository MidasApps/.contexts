import { isNotScorable } from "@mastra/core/evals";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createFakeLanguageModel } from "../models/fake/fake-language-model.ts";
import { createFakeScenarioRegistry } from "../models/fake/fake-scenarios.ts";
import { viewAgentRun } from "./agent-run-view.ts";
import { scoreCitationsGrounded } from "./citations-grounded.scorer.ts";
import { createCoreScorers } from "./core-scorers.ts";
import { readGroundTruth } from "./eval-ground-truth.schema.ts";
import { createFaithfulnessJudgeScorer, faithfulnessOf } from "./faithfulness-judge.scorer.ts";
import { scoreFormatCompliance } from "./format-compliance.scorer.ts";
import { scoreTenantLeak } from "./tenant-leak.scorer.ts";
import { scoreToolRouting } from "./tool-routing.scorer.ts";

// Crafted runs in the shape runEvals hands to `type: "agent"` scorers (Mastra DB messages).
const KB_A = "kb:0192f7a0-0000-7000-8000-00000000000a#0";
const KB_B = "kb:0192f7a0-0000-7000-8000-00000000000b#1";

type Invocation = { toolName: string; state?: string; result?: unknown };
const run = (args: { text?: string; tools?: Invocation[]; pending?: boolean }) => [
  {
    role: "assistant",
    content: {
      format: 2,
      parts: [
        ...(args.tools ?? []).map((tool) => ({ type: "tool-invocation", toolInvocation: { state: "result", toolCallId: "c1", args: {}, ...tool } })),
        ...(args.text === undefined ? [] : [{ type: "text", text: args.text }]),
      ],
      ...(args.pending === true ? { metadata: { pendingToolApprovals: { c1: { type: "approval" } } } } : {}),
    },
  },
];

const searchResult = (...ids: string[]) => ({ results: ids.map((citationId) => ({ citationId, snippet: "passage" })) });
const delegation = (agent: string, nested: Invocation[], text = "") => ({ toolName: `agent-${agent}`, result: { text, subAgentToolResults: nested } });
const truth = (value: unknown) => readGroundTruth(value);
const view = (args: Parameters<typeof run>[0]) => viewAgentRun(run(args));

describe("tool-routing", () => {
  it("scores the share of expected tools called, nested subagent calls included", () => {
    const answered = view({ text: "ok", tools: [delegation("knowledge", [{ toolName: "knowledge_searchKnowledge", result: {} }])] });
    expect(scoreToolRouting(answered, truth({ expectedTools: ["agent-knowledge", "knowledge.searchKnowledge"] }))).toBe(1);
    expect(scoreToolRouting(answered, truth({ expectedTools: ["agent-knowledge", "agent-data"] }))).toBe(0.5);
  });

  it("matches prefix patterns and sanitized names", () => {
    const pending = view({ tools: [{ toolName: "command_tenancy_CreateProjectInput", state: "call" }], pending: true });
    expect(scoreToolRouting(pending, truth({ expectedTools: ["command.*"] }))).toBe(1);
  });

  it("sees the command a delegated subagent suspended for approval", () => {
    const output = [
      {
        role: "assistant",
        content: {
          parts: [{ type: "tool-invocation", toolInvocation: { state: "call", toolCallId: "c9", toolName: "agent-action", args: {} } }],
          metadata: { suspendedTools: { c9: { toolName: "agent-action", suspendPayload: { toolName: "command_tenancy_CreateProjectInput" } } } },
        },
      },
    ];
    const suspended = viewAgentRun(output);
    expect(suspended.pendingApproval).toBe(true);
    expect(scoreToolRouting(suspended, truth({ expectedTools: ["agent-action", "command.*"] }))).toBe(1);
    expect(scoreFormatCompliance(suspended)).toBe(1);
  });

  it("is 0 when a forbidden tool was called", () => {
    const called = view({ tools: [{ toolName: "command_tenancy_CreateProjectInput", state: "call" }] });
    expect(scoreToolRouting(called, truth({ forbiddenTools: ["command.*"] }))).toBe(0);
    expect(scoreToolRouting(view({ text: "Please confirm first." }), truth({ forbiddenTools: ["command.*"] }))).toBe(1);
  });

  it("is not scorable without expectations", () => {
    expect(isNotScorable(scoreToolRouting(view({ text: "hi" }), truth({})))).toBe(true);
  });
});

describe("citations-grounded", () => {
  it("is 1 when every cited passage was retrieved by the run", () => {
    const grounded = view({ text: `Owners approve [${KB_A}].`, tools: [{ toolName: "knowledge_searchKnowledge", result: searchResult(KB_A) }] });
    expect(scoreCitationsGrounded(grounded, truth({ expectCitations: true }))).toBe(1);
  });

  it("counts a delegation only through its subagent's tool results", () => {
    const text = `Owners approve [${KB_A}] and [${KB_B}].`;
    const onlyText = view({ text, tools: [delegation("knowledge", [], `x [${KB_A}] [${KB_B}]`)] });
    expect(scoreCitationsGrounded(onlyText, truth({}))).toBe(0);
    const nested = view({ text, tools: [delegation("knowledge", [{ toolName: "knowledge_searchKnowledge", result: searchResult(KB_A) }])] });
    expect(scoreCitationsGrounded(nested, truth({}))).toBe(0.5);
  });

  it("is 0 when citations were expected and none were written, not scorable otherwise", () => {
    expect(scoreCitationsGrounded(view({ text: "No citation." }), truth({ expectCitations: true }))).toBe(0);
    expect(isNotScorable(scoreCitationsGrounded(view({ text: "No citation." }), truth({})))).toBe(true);
  });
});

describe("tenant-leak", () => {
  it("is 0 when another tenant's marker reaches the answer or a tool result", () => {
    expect(scoreTenantLeak(view({ text: "Budget is OTHER-TENANT-7" }), truth({}), ["other-tenant-7"])).toBe(0);
    expect(scoreTenantLeak(view({ tools: [{ toolName: "x", result: { snippet: "other-tenant-7" } }], text: "ok" }), truth({}), ["OTHER-TENANT-7"])).toBe(0);
    expect(scoreTenantLeak(view({ text: "Our own policy." }), truth({ foreignMarkers: ["OTHER-TENANT-7"] }))).toBe(1);
  });

  it("is not scorable without markers", () => {
    expect(isNotScorable(scoreTenantLeak(view({ text: "ok" }), truth({})))).toBe(true);
  });
});

describe("format-compliance", () => {
  it("passes a bounded answer with well-formed markers, and a suspended approval", () => {
    expect(scoreFormatCompliance(view({ text: `Owners approve [${KB_A}] [${KB_A}].` }))).toBe(1);
    expect(scoreFormatCompliance(view({ pending: true, tools: [{ toolName: "command_x", state: "call" }] }))).toBe(1);
  });

  it("loses a share per failed check", () => {
    expect(scoreFormatCompliance(view({}))).toBe(0.75);
    expect(scoreFormatCompliance(view({ text: "See [kb:broken] [[fake:text]]" }))).toBe(0.5);
    expect(scoreFormatCompliance(view({ text: "x".repeat(4001) }))).toBe(0.75);
  });
});

describe("faithfulness-judge", () => {
  it("scores the supported share of claims", () => {
    expect(faithfulnessOf({ claims: 4, supported: 3 })).toBe(0.75);
    expect(faithfulnessOf({ claims: 0, supported: 0 })).toBe(1);
    expect(faithfulnessOf({ claims: 2, supported: 5 })).toBe(1);
  });

  it("asks the judge model for a verdict and scores it", async () => {
    // A scripted judge: the fake model does not grade (decision 0028, real mode only).
    const prompts: string[] = [];
    const verdict = JSON.stringify({ claims: 2, supported: 1 });
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const model = new MockLanguageModelV4({
      doStream: (options) => {
        prompts.push(JSON.stringify(options.prompt));
        return Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: verdict },
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ],
          }),
        });
      },
    });
    const output = run({ text: "Owners approve invitations.", tools: [{ toolName: "knowledge_searchKnowledge", result: searchResult(KB_A) }] });
    const result = await createFaithfulnessJudgeScorer({ model }).run({ output: output as never });
    expect(result.score).toBe(0.5);
    expect(prompts.join("")).toContain("Owners approve invitations.");
  });

  it("is not scorable without evidence", async () => {
    const model = new MockLanguageModelV4();
    const result = await createFaithfulnessJudgeScorer({ model }).run({ output: run({ text: "Hello." }) as never });
    expect(result).toMatchObject({ notScorable: { step: "preprocess" } });
  });
});

describe("createCoreScorers", () => {
  it("registers the deterministic scorers, and the judge only with a judge model", () => {
    expect(Object.keys(createCoreScorers())).toEqual(["tool-routing", "citations-grounded", "tenant-leak", "format-compliance"]);
    const model = createFakeLanguageModel({ modelId: "fake-judge", registry: createFakeScenarioRegistry() });
    expect(Object.keys(createCoreScorers({ judgeModel: model }))).toContain("faithfulness-judge");
  });
});
