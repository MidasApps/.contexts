import { dataEnvelope, defineEndpoint, getMeEndpoint, listEnvelope, PageQuerySchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "./api-error.ts";
import { createEndpointCaller } from "./call-endpoint.ts";
import type { HttpClient, HttpRequest } from "./http-client.ts";

const none = (description: string) => ({ description, pii: "none" as const });

const ItemSchema = z.object({ id: z.string().meta(none("Id.")), name: z.string().meta(none("Name.")) });

const listItemsEndpoint = defineEndpoint({
  id: "fixture.listItems",
  method: "GET",
  path: "/v1/organizations/{organizationId}/items",
  auth: "user",
  params: z.object({ organizationId: z.string().meta(none("Organization.")) }),
  query: PageQuerySchema.extend({ status: z.array(z.string()).optional().meta(none("Statuses.")) }),
  responses: { 200: listEnvelope(ItemSchema) },
  summary: "Lists items.",
});

const createItemEndpoint = defineEndpoint({
  id: "fixture.createItem",
  method: "POST",
  path: "/v1/items",
  auth: "user",
  body: z.object({ name: z.string().meta(none("Name.")) }),
  responses: { 201: dataEnvelope(ItemSchema) },
  idempotency: "required",
  summary: "Creates an item.",
});

const deleteItemEndpoint = defineEndpoint({
  id: "fixture.deleteItem",
  method: "DELETE",
  path: "/v1/items/{itemId}",
  auth: "user",
  params: z.object({ itemId: z.string().meta(none("Item.")) }),
  responses: { 204: null },
  summary: "Deletes an item.",
});

/** Fake HttpClient that records requests and answers with one status/body. */
const fakeHttp = (status: number, body: unknown) => {
  const requests: HttpRequest[] = [];
  const http: HttpClient = {
    request: (request) => {
      requests.push(request);
      return Promise.resolve({ status, body, requestId: "req-1" });
    },
  };
  return { http, requests };
};

describe("callEndpoint", () => {
  it("encodes path params and serializes the query (lists by comma, undefined dropped)", async () => {
    const { http, requests } = fakeHttp(200, { data: [], meta: { page: { cursor: null, hasMore: false, limit: 20 } } });
    await createEndpointCaller(http)(listItemsEndpoint, {
      params: { organizationId: "org/1 ä" },
      query: { limit: 20, status: ["open", "done"], cursor: undefined },
    });
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/v1/organizations/org%2F1%20%C3%A4/items?limit=20&status=open%2Cdone",
      auth: "user",
    });
  });

  it("parses the success body with the descriptor schema and returns it typed", async () => {
    const { http } = fakeHttp(200, { data: { id: "u1", email: "ana@example.com" } });
    const me = await createEndpointCaller(http)(getMeEndpoint, {}).catch((error: unknown) => error);
    // `getMe` requires the full Me shape: a partial body is a contract mismatch, not data.
    expect(me).toBeInstanceOf(ApiError);
    expect(me).toMatchObject({ code: "INVALID_RESPONSE", status: 200, requestId: "req-1" });
  });

  it("returns the parsed body and forwards the body and Idempotency-Key", async () => {
    const { http, requests } = fakeHttp(201, { data: { id: "i1", name: "Pen" } });
    const created = await createEndpointCaller(http)(createItemEndpoint, {
      body: { name: "Pen" },
      idempotencyKey: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    });
    expect(created).toEqual({ data: { id: "i1", name: "Pen" } });
    expect(requests[0]).toMatchObject({ body: { name: "Pen" }, idempotencyKey: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });
  });

  it("generates an Idempotency-Key when the endpoint requires one and none is given", async () => {
    const { http, requests } = fakeHttp(201, { data: { id: "i1", name: "Pen" } });
    await createEndpointCaller(http)(createItemEndpoint, { body: { name: "Pen" } });
    expect(requests[0]?.idempotencyKey).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("returns undefined for 204 and rejects a status the descriptor does not declare", async () => {
    const ok = fakeHttp(204, undefined);
    await expect(
      createEndpointCaller(ok.http)(deleteItemEndpoint, { params: { itemId: "i1" } }),
    ).resolves.toBeUndefined();
    const odd = fakeHttp(200, { data: null });
    await expect(
      createEndpointCaller(odd.http)(deleteItemEndpoint, { params: { itemId: "i1" } }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
