import { createScorer } from "@mastra/core/evals";
import { type AgentRunView, viewAgentRun } from "./agent-run-view.ts";
import { CITATION_MARKER_PATTERN } from "../knowledge/citation.ts";

export const FORMAT_COMPLIANCE_SCORER_ID = "format-compliance";
/** Longest answer the chat UI renders without truncation. */
export const MAX_ANSWER_CHARS = 4000;

type FormatCheck = { readonly id: string; readonly passes: (view: AgentRunView) => boolean };

const CHECKS: readonly FormatCheck[] = [
  // A suspended approval is a complete turn without text.
  { id: "answered", passes: (view) => view.answer.length > 0 || view.pendingApproval },
  { id: "length", passes: (view) => view.answer.length <= MAX_ANSWER_CHARS },
  { id: "no-directive-residue", passes: (view) => !/\[\[fake:|<available_skills>|<untrusted_/i.test(view.answer) },
  // Every `[kb:` opener is a well-formed marker, so the UI can link it.
  { id: "citation-markers", passes: (view) => (view.answer.match(/\[kb:/gi) ?? []).length === (view.answer.match(CITATION_MARKER_PATTERN) ?? []).length },
];

/** Share of the format checks the answer passes. */
export const scoreFormatCompliance = (view: AgentRunView): number => CHECKS.filter((check) => check.passes(view)).length / CHECKS.length;

/** Deterministic: the answer is present, bounded, free of prompt residue and cites in the marker format. */
export const createFormatComplianceScorer = () =>
  createScorer({ id: FORMAT_COMPLIANCE_SCORER_ID, description: "The answer is present, bounded, free of prompt residue and uses well-formed citation markers.", type: "agent" }).generateScore(
    ({ run }) => scoreFormatCompliance(viewAgentRun(run.output)),
  );
