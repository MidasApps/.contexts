import { createScorer, type NotScorable, notScorable } from "@mastra/core/evals";
import { CITATION_MARKER_PATTERN, extractCitationIds } from "../knowledge/citation.ts";
import { type AgentRunView, type ToolCallView, viewAgentRun } from "./agent-run-view.ts";
import { type EvalGroundTruth, readGroundTruth } from "./eval-ground-truth.schema.ts";

export const CITATIONS_GROUNDED_SCORER_ID = "citations-grounded";

// A delegation's own text repeats the subagent's markers; only its tool results count as retrieved.
const retrievedBy = (call: ToolCallView): string[] =>
  call.toolName.startsWith("agent-") ? call.nested.flatMap(retrievedBy) : extractCitationIds(JSON.stringify(call.result ?? null));

export const citedIds = (answer: string): string[] => [...new Set([...answer.matchAll(CITATION_MARKER_PATTERN)].map((match) => (match[1] ?? "").toLowerCase()))];

/**
 * Share of the `[kb:…]` markers in the answer that the run retrieved (spec §11 citation
 * guard); 0 when citations were expected and none were written. Not scorable when the
 * answer cites nothing and nothing was expected.
 */
export const scoreCitationsGrounded = (view: AgentRunView, truth: EvalGroundTruth): number | NotScorable => {
  const cited = citedIds(view.answer);
  if (cited.length === 0) return truth.expectCitations ? 0 : notScorable("no citations expected or written");
  const retrieved = new Set(view.toolCalls.flatMap(retrievedBy));
  return cited.filter((id) => retrieved.has(id)).length / cited.length;
};

/** Deterministic: every cited passage was retrieved in the same run. */
export const createCitationsGroundedScorer = () =>
  createScorer({ id: CITATIONS_GROUNDED_SCORER_ID, description: "Every knowledge citation in the answer comes from a passage the run retrieved.", type: "agent" }).generateScore(
    ({ run }) => scoreCitationsGrounded(viewAgentRun(run.output), readGroundTruth(run.groundTruth)),
  );
