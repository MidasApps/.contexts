import { describe, expect, it } from "vitest";
import { parseTraceparent, withServerTracingOptions } from "./trace-context.ts";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN_ID = "00f067aa0ba902b7";
const VALID = `00-${TRACE_ID}-${SPAN_ID}-01`;

describe("parseTraceparent", () => {
  it("reads the trace id and the parent span id of a valid header", () => {
    expect(parseTraceparent(VALID)).toEqual({ traceId: TRACE_ID, parentSpanId: SPAN_ID });
    expect(parseTraceparent(`  ${VALID} `)).toEqual({ traceId: TRACE_ID, parentSpanId: SPAN_ID });
  });

  it("accepts extra fields only on future versions", () => {
    expect(parseTraceparent(`01-${TRACE_ID}-${SPAN_ID}-01-future`)).toEqual({ traceId: TRACE_ID, parentSpanId: SPAN_ID });
    expect(parseTraceparent(`${VALID}-extra`)).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["garbage", "not-a-traceparent"],
    ["version ff", `ff-${TRACE_ID}-${SPAN_ID}-01`],
    ["zero trace id", `00-${"0".repeat(32)}-${SPAN_ID}-01`],
    ["zero span id", `00-${TRACE_ID}-${"0".repeat(16)}-01`],
    ["uppercase hex", `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01`],
    ["short trace id", `00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`],
  ])("gives no context for a %s header", (_label, header) => {
    expect(parseTraceparent(header)).toBeNull();
  });
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://mastra.internal/api/agents/ping/stream", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("withServerTracingOptions", () => {
  it("drops client tracing options and sets the forwarded trace context", async () => {
    const request = await withServerTracingOptions(
      post({ messages: ["hi"], tracingOptions: { metadata: { tenantId: "other" }, traceId: "f".repeat(32) } }, { traceparent: VALID }),
    );
    expect(await request.json()).toEqual({ messages: ["hi"], tracingOptions: { traceId: TRACE_ID, parentSpanId: SPAN_ID } });
    expect(request.headers.get("traceparent")).toBe(VALID);
  });

  it("drops client tracing options when there is no valid traceparent", async () => {
    const request = await withServerTracingOptions(post({ messages: ["hi"], tracingOptions: { rootSpanName: "spoof" } }, { traceparent: "bad" }));
    expect(await request.json()).toEqual({ messages: ["hi"] });
  });

  it("leaves other requests untouched", async () => {
    const plain = post({ messages: ["hi"] });
    expect(await withServerTracingOptions(plain)).toBe(plain);
    const get = new Request("http://mastra.internal/api/agents", { headers: { traceparent: VALID } });
    expect(await withServerTracingOptions(get)).toBe(get);
    const text = new Request("http://mastra.internal/api/x", { method: "POST", headers: { "content-type": "text/plain" }, body: "tracingOptions" });
    expect(await withServerTracingOptions(text)).toBe(text);
    const broken = new Request("http://mastra.internal/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(await withServerTracingOptions(broken)).toBe(broken);
  });
});
