import type { TraceSpan } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildSpanTree, hasSpanPayload } from "./span-tree.ts";

const span = (spanId: string, parentSpanId: string | null, extra: Partial<TraceSpan> = {}): TraceSpan => ({
    spanId,
    parentSpanId,
    name: spanId,
    type: "agent_run",
    status: "ok",
    model: null,
    input: null,
    output: null,
    startedAt: "2026-09-30T12:00:00.000Z",
    durationMs: 1,
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: null,
    ...extra,
  });

const shape = (nodes: ReturnType<typeof buildSpanTree>): unknown => nodes.map((node) => [node.span.spanId, shape([...node.children])]);

describe("buildSpanTree", () => {
  it("nests spans under their parents in the API order", () => {
    const tree = buildSpanTree([span("root", null), span("a", "root"), span("a1", "a"), span("b", "root")]);
    expect(shape(tree)).toEqual([["root", [["a", [["a1", []]]], ["b", []]]]]);
  });

  it("keeps a span whose parent is missing as a root", () => {
    expect(shape(buildSpanTree([span("root", null), span("orphan", "gone")]))).toEqual([["root", []], ["orphan", []]]);
  });

  it("tells whether a span has input or output to disclose", () => {
    expect(hasSpanPayload(span("a", null))).toBe(false);
    expect(hasSpanPayload(span("a", null, { output: { ok: true } }))).toBe(true);
  });
});
