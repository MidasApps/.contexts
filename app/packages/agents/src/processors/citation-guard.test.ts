import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import type { ProcessOutputResultArgs } from "@mastra/core/processors";
import { describe, expect, it } from "vitest";
import { createCitationGuard, guardCitations } from "./citation-guard.ts";

const DOC = "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f";
const OTHER = "01928f6e-7b2a-7c3d-9e4f-000000000000";
const KNOWN = `kb:${DOC}#1`;
const UNKNOWN = `kb:${OTHER}#4`;

describe("guardCitations", () => {
  it("keeps markers of retrieved passages and strips unknown ones", () => {
    const guarded = guardCitations({
      text: `Owners approve members [${KNOWN}]. Billing is monthly [${UNKNOWN}].`,
      retrievedIds: new Set([KNOWN]),
    });
    expect(guarded).toEqual({
      text: `Owners approve members [${KNOWN}]. Billing is monthly.`,
      confidence: "normal",
      removed: [UNKNOWN],
      cited: [KNOWN],
    });
  });

  it("marks an answer without any valid citation as low confidence", () => {
    expect(guardCitations({ text: "Probably yes.", retrievedIds: new Set([KNOWN]) })).toMatchObject({
      confidence: "low",
      cited: [],
    });
    expect(guardCitations({ text: `Yes [${UNKNOWN}]`, retrievedIds: new Set() })).toMatchObject({
      text: "Yes ",
      confidence: "low",
      removed: [UNKNOWN],
    });
  });

  it("compares ids case-insensitively", () => {
    expect(
      guardCitations({ text: `A [${KNOWN.toUpperCase().replace("KB:", "kb:")}]`, retrievedIds: new Set([KNOWN]) })
        .confidence,
    ).toBe("normal");
  });
});

const assistant = (text: string, extraParts: MastraDBMessage["content"]["parts"] = []): MastraDBMessage => ({
  id: "m1",
  role: "assistant",
  createdAt: new Date(0),
  content: { format: 2, parts: [...extraParts, { type: "text", text }] },
});

const run = (messages: MastraDBMessage[], toolResults: unknown[] = []) => {
  const processor = createCitationGuard();
  const args = { messages, result: { text: "", steps: [{ toolResults }] } } as unknown as ProcessOutputResultArgs;
  return processor.processOutputResult?.(args) as MastraDBMessage[];
};

describe("createCitationGuard (output processor)", () => {
  it("treats citation ids of this turn's tool results as retrieved", () => {
    const [message] = run(
      [assistant(`Owners approve [${KNOWN}] and [${UNKNOWN}].`)],
      [{ toolName: "knowledge.searchKnowledge", result: { results: [{ citationId: KNOWN }] } }],
    );
    const text = message?.content.parts.find((part) => part.type === "text");
    expect(text).toMatchObject({ text: `Owners approve [${KNOWN}] and.` });
    expect(message?.content.metadata).toEqual({ confidence: "normal" });
  });

  it("marks an answer without citations as low confidence and leaves user messages alone", () => {
    const user = { ...assistant("hi"), role: "user" } as MastraDBMessage;
    const [first, second] = run([user, assistant("I think so.")]);
    expect(first).toBe(user);
    expect(second?.content.metadata).toEqual({ confidence: "low" });
  });
});
