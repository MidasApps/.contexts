import { describe, expect, it } from "vitest";
import { waitForHttp } from "./wait-for-http.ts";

const makeClock = () => {
  let current = 0;
  return { now: () => current, sleep: (ms: number) => { current += ms; return Promise.resolve(); } };
};

describe("waitForHttp", () => {
  it("resolves ready once the url answers with a 2xx status", async () => {
    const clock = makeClock();
    const statuses = [undefined, 503, 200];
    let calls = 0;
    const fetchStatus = (): Promise<number | undefined> => Promise.resolve(statuses[calls++]);
    const result = await waitForHttp({ url: "http://localhost:1/health", timeoutMs: 10_000, intervalMs: 500, fetchStatus, ...clock });
    expect(result).toEqual({ ready: true, status: 200 });
    expect(calls).toBe(3);
  });

  it("gives up after the timeout and reports the last status", async () => {
    const clock = makeClock();
    const result = await waitForHttp({
      url: "http://localhost:1/health", timeoutMs: 2_000, intervalMs: 500,
      fetchStatus: () => Promise.resolve(500), ...clock,
    });
    expect(result).toEqual({ ready: false, lastStatus: 500 });
    expect(clock.now()).toBeGreaterThanOrEqual(2_000);
  });

  it("stops early when the abort signal fires", async () => {
    const clock = makeClock();
    const controller = new AbortController();
    controller.abort();
    const result = await waitForHttp({
      url: "http://localhost:1/health", timeoutMs: 60_000, intervalMs: 500,
      fetchStatus: () => Promise.resolve(undefined), signal: controller.signal, ...clock,
    });
    expect(result).toEqual({ ready: false, lastStatus: undefined });
  });
});
