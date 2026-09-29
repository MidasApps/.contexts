import { describe, expect, it } from "vitest";
import { createHealthClient } from "./health-client.ts";

const BASE_URL = "http://localhost:3000";

type FetchCall = { url: string; init: RequestInit | undefined };

/** Fake fetch: records calls and answers with the given response or error. */
const fakeFetch = (answer: () => Promise<Response>) => {
  const calls: FetchCall[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
    return answer();
  };
  return { calls, fetchFn };
};

/** Fetch that settles only when its signal aborts, like a hung connection. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
  });

const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));

describe("createHealthClient", () => {
  it("returns ok when the API answers the health envelope", async () => {
    const { calls, fetchFn } = fakeFetch(() => json({ data: { status: "ok" } }));
    const client = createHealthClient({ baseUrl: BASE_URL, fetch: fetchFn });

    const result = await client.checkHealth();

    expect(result).toEqual({ ok: true, status: "ok" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:3000/v1/health");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.credentials).toBe("omit");
  });

  it("reports HTTP_ERROR with the status for a non-2xx answer", async () => {
    const { fetchFn } = fakeFetch(() => json({ error: { code: "INTERNAL_ERROR", message: "x", requestId: "r" } }, 500));

    const result = await createHealthClient({ baseUrl: BASE_URL, fetch: fetchFn }).checkHealth();

    expect(result).toEqual({ ok: false, error: { code: "HTTP_ERROR", httpStatus: 500 } });
  });

  it("reports INVALID_RESPONSE when the body does not match the contract", async () => {
    const { fetchFn } = fakeFetch(() => json({ status: "ok" }));

    const result = await createHealthClient({ baseUrl: BASE_URL, fetch: fetchFn }).checkHealth();

    expect(result).toEqual({ ok: false, error: { code: "INVALID_RESPONSE" } });
  });

  it("reports INVALID_RESPONSE when the body is not JSON", async () => {
    const { fetchFn } = fakeFetch(() => Promise.resolve(new Response("<html>", { status: 200 })));

    const result = await createHealthClient({ baseUrl: BASE_URL, fetch: fetchFn }).checkHealth();

    expect(result).toEqual({ ok: false, error: { code: "INVALID_RESPONSE" } });
  });

  it("reports NETWORK_ERROR when fetch rejects (API down, CORS or CSP block)", async () => {
    const { fetchFn } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await createHealthClient({ baseUrl: BASE_URL, fetch: fetchFn }).checkHealth();

    expect(result).toEqual({ ok: false, error: { code: "NETWORK_ERROR" } });
  });

  it("reports TIMEOUT when the timeout signal fires first", async () => {
    const timeout = new AbortController();
    const client = createHealthClient({ baseUrl: BASE_URL, fetch: hangingFetch, timeoutSignal: () => timeout.signal });

    const pending = client.checkHealth();
    timeout.abort(new DOMException("timed out", "TimeoutError"));

    await expect(pending).resolves.toEqual({ ok: false, error: { code: "TIMEOUT" } });
  });

  it("reports ABORTED when the caller cancels (e.g. the route unloads)", async () => {
    const caller = new AbortController();
    const client = createHealthClient({ baseUrl: BASE_URL, fetch: hangingFetch });

    const pending = client.checkHealth(caller.signal);
    caller.abort();

    await expect(pending).resolves.toEqual({ ok: false, error: { code: "ABORTED" } });
  });
});
