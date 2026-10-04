import { describe, expect, it } from "vitest";
import { createMastraWorkflowApprovalSettler } from "./mastra-workflow-approval-settler.ts";

type Call = { url: string; init: RequestInit };

const fakeFetch = (response: Response | Error) => {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Mastra workflow approval settler", () => {
  it("POSTs to the settle route outside the API prefix with only the request id and the serverless token", async () => {
    const { fetchFn, calls } = fakeFetch(json(200, { data: { settled: true, runStatus: "success" } }));
    const settler = createMastraWorkflowApprovalSettler({
      baseUrl: "http://127.0.0.1:4111/",
      serverlessToken: { headerValue: () => Promise.resolve("Bearer id-token") },
      fetch: fetchFn,
    });
    expect(
      await settler.settle({ approvalRequestId: "Ar9oP1lK3jH5gF7dS9aQ", requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" }),
    ).toEqual({ ok: true, data: { settled: true, runStatus: "success" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:4111/workflow-approvals/Ar9oP1lK3jH5gF7dS9aQ/settle");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      "x-request-id": "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      "x-serverless-authorization": "Bearer id-token",
    });
  });

  it("sends no serverless token in local and encodes the id", async () => {
    const { fetchFn, calls } = fakeFetch(json(200, { data: { settled: false, reason: "NOT_SUSPENDED" } }));
    const settler = createMastraWorkflowApprovalSettler({
      baseUrl: "http://127.0.0.1:4111",
      serverlessToken: null,
      fetch: fetchFn,
    });
    expect(await settler.settle({ approvalRequestId: "a/b", requestId: "r" })).toEqual({
      ok: true,
      data: { settled: false, reason: "NOT_SUSPENDED" },
    });
    expect(calls[0]?.url).toBe("http://127.0.0.1:4111/workflow-approvals/a%2Fb/settle");
    expect(calls[0]?.init.headers).toEqual({ "x-request-id": "r" });
  });

  it("maps statuses and network failures to gateway errors, never reading an error body", async () => {
    const statusOf = async (response: Response | Error) =>
      createMastraWorkflowApprovalSettler({
        baseUrl: "http://m",
        serverlessToken: null,
        fetch: fakeFetch(response).fetchFn,
      }).settle({ approvalRequestId: "x", requestId: "r" });
    expect(await statusOf(json(404, { error: { code: "NOT_FOUND" } }))).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", status: 404 },
    });
    expect(await statusOf(json(500, { error: "stack" }))).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
    expect(await statusOf(new TypeError("fetch failed"))).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
    expect(await statusOf(json(200, { data: { settled: "yes" } }))).toEqual({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", status: 502 },
    });
  });
});
