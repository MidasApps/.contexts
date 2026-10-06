import { describe, expect, it } from "vitest";
import { takeSseFrames, workflowEventOf } from "./parse-sse.ts";

const EVENT = {
  index: 0,
  type: "workflow-start",
  stepId: null,
  status: "running",
  occurredAt: "2026-09-30T12:00:00.000Z",
};

describe("workflow progress stream parsing", () => {
  it("returns complete frames and keeps the unfinished tail", () => {
    const chunk = `id: 0\nevent: data\ndata: ${JSON.stringify(EVENT)}\n\n: keep-alive\n\nevent: done\ndata: {"status":"suc`;
    const { frames, rest } = takeSseFrames(chunk);
    expect(frames).toEqual([{ event: "data", data: JSON.stringify(EVENT) }]);
    expect(rest).toBe('event: done\ndata: {"status":"suc');
    expect(takeSseFrames(`${rest}cess"}\n\n`).frames).toEqual([{ event: "done", data: '{"status":"success"}' }]);
  });

  it("reads a workflow event from a data frame and ignores other or malformed frames", () => {
    expect(workflowEventOf({ event: "data", data: JSON.stringify(EVENT) })).toEqual(EVENT);
    expect(workflowEventOf({ event: "done", data: "{}" })).toBeNull();
    expect(workflowEventOf({ event: "data", data: "{not json" })).toBeNull();
    expect(workflowEventOf({ event: "data", data: '{"index":"x"}' })).toBeNull();
  });
});
