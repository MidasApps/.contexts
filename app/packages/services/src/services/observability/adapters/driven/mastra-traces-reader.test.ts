import { describe, expect, it } from "vitest";
import { createMastraConsoleGateway } from "./mastra-traces-reader.ts";

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Mastra console gateway", () => {
  it("passes the tenant filter in the query, sends no user credential and parses the contracts", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const gateway = createMastraConsoleGateway({
      baseUrl: "http://mastra.local/",
      serverlessToken: null,
      fetch: ((url: string, init: RequestInit) => {
        seen.push({ url, headers: init.headers as Record<string, string> });
        return Promise.resolve(answer(200, { data: [], meta: { hasMore: true } }));
      }) as unknown as typeof fetch,
    });
    expect(await gateway.listTraces({ tenantId: "TenantAaaaaaaaaaaaaaa", page: 1, perPage: 5, status: "error" })).toEqual({ ok: true, data: { traces: [], hasMore: true } });
    expect(await gateway.listExperiments({ tenantId: null, page: 0, perPage: 20 })).toEqual({ ok: true, data: { experiments: [], hasMore: true } });
    expect(seen.map((call) => call.url)).toEqual(["http://mastra.local/console/traces?tenantId=TenantAaaaaaaaaaaaaaa&page=1&perPage=5&status=error", "http://mastra.local/console/experiments?page=0&perPage=20"]);
    expect(Object.keys(seen[0]?.headers ?? {})).not.toContain("authorization");
  });

  it("reads one experiment by id with the tenant filter", async () => {
    const urls: string[] = [];
    const experiment = { experimentId: "exp/1", datasetId: "ds", agentId: "assistant", promptVersionId: null, status: "completed", itemCount: 3, scores: [], verdict: "passed", startedAt: "2026-10-01T10:00:00.000Z", finishedAt: "2026-10-01T10:05:00.000Z" };
    const gateway = createMastraConsoleGateway({
      baseUrl: "http://m",
      serverlessToken: null,
      fetch: ((url: string) => (urls.push(url), Promise.resolve(answer(200, { data: experiment })))) as unknown as typeof fetch,
    });
    expect(await gateway.getExperiment({ experimentId: "exp/1", tenantId: "TenantAaaaaaaaaaaaaaa" })).toEqual({ ok: true, data: experiment });
    expect(await gateway.getExperiment({ experimentId: "exp-2", tenantId: null })).toEqual({ ok: true, data: experiment });
    expect(urls).toEqual(["http://m/console/experiments/exp%2F1?tenantId=TenantAaaaaaaaaaaaaaa", "http://m/console/experiments/exp-2"]);
  });

  it("maps statuses without reading error bodies and refuses a malformed answer", async () => {
    const respond = (response: Response) => createMastraConsoleGateway({ baseUrl: "http://m", serverlessToken: null, fetch: () => Promise.resolve(response) });
    expect(await respond(answer(404, { secret: "x" })).getTrace({ traceId: "t", tenantId: null })).toEqual({ ok: false, error: { code: "NOT_FOUND", status: 404 } });
    expect(await respond(answer(200, { data: [{ id: 1 }] })).listDatasets({ tenantId: null })).toEqual({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    expect(await respond(answer(422, {})).startExperiment({ tenantId: "t", userId: "u", datasetId: "d", agentId: "web", requestId: "r" })).toEqual({ ok: false, error: { code: "VALIDATION_FAILED", status: 400 } });
  });

  it("manages a tenant's dataset items with the tenant in the query or the body, and maps a taken name to 409", async () => {
    const seen: { method: string; url: string; body: unknown }[] = [];
    const item = { id: "item-1", datasetId: "ds-1", input: "Hi", expectedOutput: null, createdAt: "2026-10-01T10:00:00.000Z" };
    const dataset = { id: "ds-1", name: "refunds", tenantId: "TenantAaaaaaaaaaaaaaa", version: 0, targetIds: ["assistant"], createdAt: "2026-10-01T10:00:00.000Z" };
    const gateway = createMastraConsoleGateway({
      baseUrl: "http://m",
      serverlessToken: null,
      fetch: ((url: string, init: RequestInit) => {
        seen.push({ method: init.method ?? "GET", url, body: init.body === undefined ? undefined : JSON.parse(init.body as string) });
        if (init.method === "DELETE") return Promise.resolve(answer(200, { data: { itemId: "item-1" } }));
        if (url.endsWith("/console/datasets")) return Promise.resolve(answer(201, { data: dataset }));
        return Promise.resolve(init.method === "POST" ? answer(201, { data: item }) : answer(200, { data: [item], meta: { hasMore: false } }));
      }) as unknown as typeof fetch,
    });
    const tenantId = "TenantAaaaaaaaaaaaaaa";
    expect(await gateway.listDatasetItems({ tenantId, datasetId: "ds-1", page: 0, perPage: 20 })).toEqual({ ok: true, data: { items: [item], hasMore: false } });
    expect(await gateway.addDatasetItem({ tenantId, datasetId: "ds-1", input: "Hi" })).toEqual({ ok: true, data: item });
    expect(await gateway.deleteDatasetItem({ tenantId, datasetId: "ds-1", itemId: "item-1" })).toEqual({ ok: true, data: { itemId: "item-1" } });
    expect(await gateway.createDataset({ tenantId, name: "refunds" })).toEqual({ ok: true, data: dataset });
    expect(seen).toEqual([
      { method: "GET", url: `http://m/console/datasets/ds-1/items?tenantId=${tenantId}&page=0&perPage=20`, body: undefined },
      { method: "POST", url: "http://m/console/datasets/ds-1/items", body: { tenantId, input: "Hi" } },
      { method: "DELETE", url: `http://m/console/datasets/ds-1/items/item-1?tenantId=${tenantId}`, body: undefined },
      { method: "POST", url: "http://m/console/datasets", body: { tenantId, name: "refunds" } },
    ]);
    const taken = createMastraConsoleGateway({ baseUrl: "http://m", serverlessToken: null, fetch: () => Promise.resolve(answer(409, {})) });
    expect(await taken.createDataset({ tenantId, name: "refunds" })).toEqual({ ok: false, error: { code: "CONFLICT", status: 409 } });
  });
});
