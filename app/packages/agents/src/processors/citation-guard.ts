import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type { OutputProcessor, ProcessOutputResultArgs } from "@mastra/core/processors";
import { CITATION_MARKER_PATTERN, extractCitationIds } from "../knowledge/citation.ts";

/**
 * Citation guard (SP3 spec §11, harness-engineering "citation checks"): an answer may
 * cite only passages retrieved in this turn. Unknown `[kb:...]` markers are stripped;
 * an answer with no valid citation gets message metadata `confidence: "low"` (SP4 shows
 * "not sure"), a grounded one `confidence: "normal"` (the values of `MessageMetadataSchema`).
 */

export const CITATION_GUARD_ID = "citation-guard";

export type CitationConfidence = "normal" | "low";

export type GuardedAnswer = {
  readonly text: string;
  readonly confidence: CitationConfidence;
  readonly removed: readonly string[];
  readonly cited: readonly string[];
};

/** Pure core of the guard: strips markers of ids outside `retrievedIds` and grades the answer. */
export const guardCitations = (input: {
  readonly text: string;
  readonly retrievedIds: ReadonlySet<string>;
}): GuardedAnswer => {
  const removed: string[] = [];
  const cited: string[] = [];
  const text = input.text.replace(CITATION_MARKER_PATTERN, (marker: string, id: string) => {
    const normalized = id.toLowerCase();
    if (input.retrievedIds.has(normalized)) {
      if (!cited.includes(normalized)) cited.push(normalized);
      return marker;
    }
    removed.push(normalized);
    return "";
  });
  const clean = removed.length === 0 ? text : text.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
  return { text: clean, confidence: cited.length === 0 ? "low" : "normal", removed, cited };
};

type Part = MastraDBMessage["content"]["parts"][number];

// Tool invocations of the turn (search results): every citation id they carry was retrieved.
const retrievedIdsOf = (args: Pick<ProcessOutputResultArgs, "messages" | "result">): Set<string> => {
  const fromSteps = (args.result.steps ?? []).map((step) => JSON.stringify(step.toolResults ?? []));
  const fromParts = args.messages.flatMap((message) =>
    message.content.parts.filter((part: Part) => part.type !== "text").map((part: Part) => JSON.stringify(part)),
  );
  return new Set([...fromSteps, ...fromParts].flatMap(extractCitationIds));
};

const guardMessage = (message: MastraDBMessage, retrievedIds: ReadonlySet<string>): MastraDBMessage => {
  if (message.role !== "assistant") return message;
  const texts = message.content.parts.filter((part: Part) => part.type === "text");
  if (texts.length === 0) return message;
  let confidence: CitationConfidence = "low";
  const parts = message.content.parts.map((part: Part) => {
    if (part.type !== "text") return part;
    const guarded = guardCitations({ text: part.text, retrievedIds });
    if (guarded.confidence === "normal") confidence = "normal";
    return { ...part, text: guarded.text };
  });
  const legacy =
    typeof message.content.content === "string"
      ? { content: guardCitations({ text: message.content.content, retrievedIds }).text }
      : {};
  return {
    ...message,
    content: { ...message.content, ...legacy, parts, metadata: { ...message.content.metadata, confidence } },
  };
};

/** Output processor of the knowledge agent (spec §6: its guardrail profile). */
export const createCitationGuard = (): OutputProcessor => ({
  id: CITATION_GUARD_ID,
  name: "Citation guard",
  description:
    "Strips citations of passages not retrieved in this turn and marks ungrounded answers as low confidence.",
  processOutputResult: (args) => {
    const retrievedIds = retrievedIdsOf(args);
    return args.messages.map((message) => guardMessage(message, retrievedIds));
  },
});
