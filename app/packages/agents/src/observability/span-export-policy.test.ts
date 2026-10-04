import {
  type AnyExportedSpan,
  type ObservabilityExporter,
  SpanType,
  type TracingEvent,
  TracingEventType,
} from "@mastra/core/observability";
import { describe, expect, it } from "vitest";
import { hashResourceId, isTraceSampled, sampleTraces, scrubSpanForExport } from "./span-export-policy.ts";

const span = (traceId = "4bf92f3577b34da6a3ce929d0e0e4736"): AnyExportedSpan => ({
  id: "span-1",
  traceId,
  name: "agent run: knowledge",
  type: SpanType.AGENT_RUN,
  startTime: new Date(0),
  isEvent: false,
  isRootSpan: true,
  metadata: {
    tenantId: "tenantA",
    requestId: "req-1",
    resourceId: "tenantA:member-uid",
    userId: "member-uid",
    runId: "run-1",
  },
  requestContext: {
    tenantId: "tenantA",
    userId: "member-uid",
    permissions: ["core.chat.use"],
    corePrincipal: { uid: "member-uid" },
    requestId: "req-1",
  },
  input: { messages: ["my prompt"] },
  output: { text: "my answer" },
});

const POLICY = { contextKeys: ["tenantId", "requestId"], keepPayloads: false };

describe("scrubSpanForExport", () => {
  it("hashes the resource id and drops the uid from metadata", () => {
    const scrubbed = scrubSpanForExport(span(), POLICY);
    expect(scrubbed.metadata).toEqual({
      tenantId: "tenantA",
      requestId: "req-1",
      resourceId: hashResourceId("tenantA:member-uid"),
      runId: "run-1",
    });
    expect(hashResourceId("tenantA:member-uid")).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(JSON.stringify(scrubbed)).not.toContain("member-uid");
  });

  it("keeps only the allowed request-context keys", () => {
    expect(scrubSpanForExport(span(), POLICY).requestContext).toEqual({ tenantId: "tenantA", requestId: "req-1" });
  });

  it("drops prompts and answers unless payloads are kept, and never changes the original span", () => {
    const original = span();
    const withoutPayloads = scrubSpanForExport(original, POLICY);
    expect("input" in withoutPayloads || "output" in withoutPayloads).toBe(false);
    expect(scrubSpanForExport(original, { ...POLICY, keepPayloads: true })).toMatchObject({
      input: { messages: ["my prompt"] },
    });
    expect(original.metadata?.["resourceId"]).toBe("tenantA:member-uid");
  });
});

describe("isTraceSampled", () => {
  const ids = Array.from({ length: 2000 }, (_, index) => index.toString(16).padStart(32, "0"));

  it("keeps about the ratio of traces, the same way every time", () => {
    const kept = ids.filter((id) => isTraceSampled(id, 0.2)).length;
    expect(kept).toBeGreaterThan(300);
    expect(kept).toBeLessThan(500);
    expect(ids.filter((id) => isTraceSampled(id, 0.2)).length).toBe(kept);
  });

  it("keeps everything at 1 and nothing at 0", () => {
    expect(ids.every((id) => isTraceSampled(id, 1))).toBe(true);
    expect(ids.some((id) => isTraceSampled(id, 0))).toBe(false);
  });
});

describe("sampleTraces", () => {
  const recorder = () => {
    const traces: string[] = [];
    const calls: string[] = [];
    const exporter: ObservabilityExporter = {
      name: "recorder",
      exportTracingEvent: (event) => (traces.push(event.exportedSpan.traceId), Promise.resolve()),
      onMetricEvent: () => void calls.push("metric"),
      flush: () => (calls.push("flush"), Promise.resolve()),
      shutdown: () => (calls.push("shutdown"), Promise.resolve()),
    };
    return { exporter, traces, calls };
  };

  it("exports only sampled traces and passes every other signal through", async () => {
    const { exporter, traces, calls } = recorder();
    const sampled = sampleTraces(exporter, 0.5);
    const ids = Array.from({ length: 50 }, (_, index) => index.toString(16).padStart(32, "a"));
    for (const id of ids)
      await sampled.exportTracingEvent({
        type: TracingEventType.SPAN_ENDED,
        exportedSpan: span(id),
      } satisfies TracingEvent);
    expect(traces).toEqual(ids.filter((id) => isTraceSampled(id, 0.5)));
    expect(sampled.name).toBe("recorder");
    await sampled.onMetricEvent?.({} as never);
    await sampled.flush();
    await sampled.shutdown();
    expect(calls).toEqual(["metric", "flush", "shutdown"]);
  });

  it("returns the exporter itself when every trace is kept", () => {
    const { exporter } = recorder();
    expect(sampleTraces(exporter, 1)).toBe(exporter);
  });
});
