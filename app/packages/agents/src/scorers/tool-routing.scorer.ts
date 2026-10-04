import { createScorer, type NotScorable, notScorable } from "@mastra/core/evals";
import { type AgentRunView, allToolCalls, toolNameMatches, viewAgentRun } from "./agent-run-view.ts";
import { type EvalGroundTruth, readGroundTruth } from "./eval-ground-truth.schema.ts";

export const TOOL_ROUTING_SCORER_ID = "tool-routing";

/**
 * Share of the expected tools (or delegations) the run called, subagents included;
 * 0 when it called a forbidden tool. Not scorable without expectations.
 */
export const scoreToolRouting = (view: AgentRunView, truth: EvalGroundTruth): number | NotScorable => {
  if (truth.expectedTools.length === 0 && truth.forbiddenTools.length === 0)
    return notScorable("no expected or forbidden tools");
  const called = allToolCalls(view).map((call) => call.toolName);
  if (truth.forbiddenTools.some((pattern) => called.some((name) => toolNameMatches(name, pattern)))) return 0;
  if (truth.expectedTools.length === 0) return 1;
  const hits = truth.expectedTools.filter((pattern) => called.some((name) => toolNameMatches(name, pattern)));
  return hits.length / truth.expectedTools.length;
};

/** Deterministic: the expected tool or subagent was called (spec §13). */
export const createToolRoutingScorer = () =>
  createScorer({
    id: TOOL_ROUTING_SCORER_ID,
    description: "The run called the expected tools or subagents and none of the forbidden ones.",
    type: "agent",
  }).generateScore(({ run }) => scoreToolRouting(viewAgentRun(run.output), readGroundTruth(run.groundTruth)));
