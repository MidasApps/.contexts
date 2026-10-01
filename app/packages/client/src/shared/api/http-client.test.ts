import { RequestIdSchema } from "@core/contracts";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-error.ts";
import { createHttpClient, type FetchLike } from "./http-client.ts";

type Call = { url: string; init: RequestInit };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Fake fetch answering from a queue and recording every call. */
const fakeFetch = (...responses: Response[]) => {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    return next === undefined ? Promise.reject(new Error("no response queued")) : Promise.resolve(next);
  };
  return { fetch, calls };
};

const header = (call: Call | undefined, name: string): string | null => new Headers(call?.init.headers).get(name);

const tokens = () => vi.fn(({ forceRefresh }: { forceRefresh: boolean }) => Promise.resolve(forceRefresh ? "fresh-token" : "token"));

describe("createHttpClient", () => {
  it("sends the Bearer token, a ULID x-request-id per call and JSON bodies", async () => {
    const { fetch, calls } = fakeFetch(json(200, { data: 1 }), json(201, { data: 2 }));
    const http = createHttpClient({ baseUrl: "https://api.test", getIdToken: tokens(), fetch });
    await http.request({ method: "GET", path: "/v1/me" });
    const created = await http.request({ method: "POST", path: "/v1/organizations", body: { name: "Acme" }, idempotencyKey: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });
    expect(calls[0]?.url).toBe("https://api.test/v1/me");
    expect(header(calls[0], "authorization")).toBe("Bearer token");
    expect(RequestIdSchema.safeParse(header(calls[0], "x-request-id")).success).toBe(true);
    expect(header(calls[0], "x-request-id")).not.toBe(header(calls[1], "x-request-id"));
    expect(header(calls[1], "content-type")).toBe("application/json");
    expect(header(calls[1], "idempotency-key")).toBe("01J8Z3K4M5N6P7Q8R9S0T1V2W3");
    expect(calls[1]?.init.body).toBe('{"name":"Acme"}');
    expect(created).toMatchObject({ status: 201, body: { data: 2 } });
  });

  it("omits Authorization on public endpoints", async () => {
    const { fetch, calls } = fakeFetch(json(200, { data: {} }));
    const getIdToken = tokens();
    await createHttpClient({ baseUrl: "", getIdToken, fetch }).request({ method: "GET", path: "/v1/health", auth: "none" });
    expect(header(calls[0], "authorization")).toBeNull();
    expect(getIdToken).not.toHaveBeenCalled();
    expect(calls[0]?.url).toBe("/v1/health");
  });

  it("on 401 forces one token refresh and retries an idempotent call once", async () => {
    const unauthorized = { error: { code: "UNAUTHORIZED", message: "Unauthorized.", requestId: "r1" } };
    const { fetch, calls } = fakeFetch(json(401, unauthorized), json(200, { data: "ok" }));
    const getIdToken = tokens();
    const result = await createHttpClient({ baseUrl: "", getIdToken, fetch }).request({ method: "GET", path: "/v1/me" });
    expect(result.body).toEqual({ data: "ok" });
    expect(getIdToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(header(calls[1], "authorization")).toBe("Bearer fresh-token");
    expect(calls).toHaveLength(2);
  });

  it("does not retry a non-idempotent call without Idempotency-Key, and stops after one refresh", async () => {
    const unauthorized = () => json(401, { error: { code: "UNAUTHORIZED", message: "Unauthorized.", requestId: "r2" } });
    const post = fakeFetch(unauthorized());
    const http = createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch: post.fetch });
    await expect(http.request({ method: "POST", path: "/v1/me/claims/sync" })).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(post.calls).toHaveLength(1);
    const get = fakeFetch(unauthorized(), unauthorized());
    const again = createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch: get.fetch });
    await expect(again.request({ method: "GET", path: "/v1/me" })).rejects.toBeInstanceOf(ApiError);
    expect(get.calls).toHaveLength(2);
  });

  it("turns the error envelope into an ApiError with code, details and requestId", async () => {
    const envelope = { error: { code: "VALIDATION_FAILED", message: "Invalid.", details: [{ field: "name", issue: "TOO_SMALL" }], requestId: "req-9" } };
    const { fetch } = fakeFetch(json(400, envelope));
    const error = await createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch })
      .request({ method: "PATCH", path: "/v1/me", body: {} })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_FAILED", details: [{ field: "name", issue: "TOO_SMALL" }], requestId: "req-9" });
  });

  it("maps a body that is not the envelope to INVALID_RESPONSE, keeping the response request id", async () => {
    const { fetch } = fakeFetch(new Response("<html>", { status: 502, headers: { "x-request-id": "edge-1" } }));
    await expect(createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch }).request({ method: "GET", path: "/v1/me" })).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
      requestId: "edge-1",
    });
  });

  it("aborts after the timeout with TIMEOUT and rethrows a caller abort as is", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        // Like fetch: an already aborted signal rejects at once.
        const abort = () => {
          const reason: unknown = init?.signal?.reason;
          reject(reason instanceof Error ? reason : Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (init?.signal?.aborted === true) abort();
        init?.signal?.addEventListener("abort", abort);
      });
    const http = createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch: hanging, timeoutMs: 5 });
    await expect(http.request({ method: "GET", path: "/v1/me" })).rejects.toMatchObject({ code: "TIMEOUT", status: 0 });
    const controller = new AbortController();
    const pending = http.request({ method: "GET", path: "/v1/me", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toHaveProperty("name", "AbortError");
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    const offline: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(createHttpClient({ baseUrl: "", getIdToken: tokens(), fetch: offline }).request({ method: "GET", path: "/v1/me" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
});
