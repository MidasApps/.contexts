import { describe, expect, it } from "vitest";
import { encodeDone, encodeError, encodeWorkflowEvent, resumeIndexOf } from "./workflow-event-sse.ts";

describe("workflow event SSE encoding", () => {
  it("frames a data event with its index as the SSE id and one JSON line", () => {
    const text = encodeWorkflowEvent({
      index: 3,
      type: "workflow-step-start",
      stepId: "apply",
      status: "running",
      occurredAt: "2026-09-30T12:00:00.000Z",
    });
    expect(text).toBe(
      'id: 3\nevent: data\ndata: {"index":3,"type":"workflow-step-start","stepId":"apply","status":"running","occurredAt":"2026-09-30T12:00:00.000Z"}\n\n',
    );
  });

  it("closes with done or with the error envelope", () => {
    expect(encodeDone({ requestId: "r1", status: "success" })).toBe(
      'event: done\ndata: {"requestId":"r1","status":"success"}\n\n',
    );
    expect(encodeError({ code: "UPSTREAM_UNAVAILABLE", message: "Upstream unavailable.", requestId: "r1" })).toBe(
      'event: error\ndata: {"error":{"code":"UPSTREAM_UNAVAILABLE","message":"Upstream unavailable.","requestId":"r1"}}\n\n',
    );
  });

  it("resumes after a valid Last-Event-Id and from the start otherwise", () => {
    expect(resumeIndexOf("4")).toBe(4);
    expect(resumeIndexOf(null)).toBe(-1);
    expect(resumeIndexOf("-2")).toBe(-1);
    expect(resumeIndexOf("abc")).toBe(-1);
  });
});
