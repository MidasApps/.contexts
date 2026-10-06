import { describe, expect, it } from "vitest";
import { trackRunStream } from "./run-stream.ts";

const encoder = new TextEncoder();

const upstreamOf = (chunks: string[], options: { fail?: boolean } = {}) => {
  let cancelled: unknown = "not cancelled";
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (options.fail === true) controller.error(new Error("upstream reset"));
      else controller.close();
    },
    cancel: (reason) => {
      cancelled = reason;
    },
  });
  return { stream, cancelled: () => cancelled };
};

describe("trackRunStream", () => {
  it("passes the bytes through unchanged and reports the upstream end once, before the client sees it", async () => {
    const events: string[] = [];
    const upstream = upstreamOf(['data: {"type":"start"}\n\n', "data: [DONE]\n\n"]);
    const tracked = trackRunStream(upstream.stream, () => {
      events.push("ended");
      return Promise.resolve();
    });
    const text = await new Response(tracked).text();
    events.push("client-done");
    expect(text).toBe('data: {"type":"start"}\n\ndata: [DONE]\n\n');
    expect(events).toEqual(["ended", "client-done"]);
  });

  it("reports the end when the upstream fails mid-stream", async () => {
    let ended = 0;
    const tracked = trackRunStream(upstreamOf(["partial"], { fail: true }).stream, () => Promise.resolve(void ended++));
    await expect(new Response(tracked).text()).rejects.toThrow();
    expect(ended).toBe(1);
  });

  it("does not report an end when the client cancels: the run goes on and stays resumable", async () => {
    let ended = 0;
    const upstream = upstreamOf(["a", "b"]);
    const tracked = trackRunStream(upstream.stream, () => Promise.resolve(void ended++));
    const reader = tracked.getReader();
    await reader.read();
    await reader.cancel("client left");
    expect(ended).toBe(0);
    expect(upstream.cancelled()).toBe("client left");
  });
});
