import type { UIMessage } from "ai";
import { KNOWLEDGE_AGENT_ID } from "../agents/knowledge-agent.ts";
import { extractCitationIds } from "../knowledge/citation.ts";
import { type CitationConfidence, guardCitations } from "../processors/citation-guard.ts";

/**
 * Confidence of a chat answer (SP4 spec §5.3 "sem certeza", SP0 follow-up #42). The citation
 * guard grades the knowledge subagent's own message, which the chat never shows: the member reads
 * the supervisor's answer, and the knowledge answer reaches it as the output of the
 * `agent-knowledge` tool call. So the chat grades that output with the same rule — a knowledge
 * answer that cites no passage retrieved in the delegation is `low` — and writes it to the
 * metadata of the supervisor's message, live (stream tap) and on history reads.
 */

/** Stream name of the knowledge delegation tool (`agent-<subagent id>`). */
export const KNOWLEDGE_DELEGATION_TOOL = `agent-${KNOWLEDGE_AGENT_ID}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Confidence of one knowledge delegation output (`{ text, subAgentToolResults }`), or `undefined` for another shape. */
export const confidenceOfDelegation = (output: unknown): CitationConfidence | undefined => {
  if (!isRecord(output) || typeof output["text"] !== "string") return undefined;
  const retrievedIds = new Set(extractCitationIds(JSON.stringify(output["subAgentToolResults"] ?? [])));
  return guardCitations({ text: output["text"], retrievedIds }).confidence;
};

/** Several delegations in one answer: grounded once any of them is (the guard's own rule per message). */
export const mergeConfidence = (current: CitationConfidence | undefined, next: CitationConfidence | undefined): CitationConfidence | undefined => {
  if (next === undefined) return current;
  return current === "normal" || next === "normal" ? "normal" : "low";
};

type LoosePart = { readonly type: string; readonly [key: string]: unknown };

const confidenceOfMessage = (message: UIMessage): CitationConfidence | undefined =>
  (message.parts as readonly LoosePart[])
    .filter((part) => part.type === `tool-${KNOWLEDGE_DELEGATION_TOOL}` && part["state"] === "output-available")
    .reduce<CitationConfidence | undefined>((confidence, part) => mergeConfidence(confidence, confidenceOfDelegation(part["output"])), undefined);

/** Stored assistant messages with `metadata.confidence` set from their knowledge delegations. */
export const withAnswerConfidence = (messages: readonly UIMessage[]): UIMessage[] =>
  messages.map((message) => {
    const confidence = message.role === "assistant" ? confidenceOfMessage(message) : undefined;
    if (confidence === undefined) return message;
    const metadata = isRecord(message.metadata) ? message.metadata : {};
    return { ...message, metadata: { ...metadata, confidence } };
  });
