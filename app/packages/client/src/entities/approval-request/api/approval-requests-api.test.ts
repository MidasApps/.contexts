import { describe, expect, it } from "vitest";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { type ApiTransport, createApprovalRequestsApi } from "./approval-requests-api.ts";

const answering = (status: number, body: unknown) => {
  const requests: Parameters<ApiTransport>[0][] = [];
  const transport: ApiTransport = (request) => {
    requests.push(request);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { api: createApprovalRequestsApi(transport), requests };
};

describe("approval requests api", () => {
  it("lists the organization's requests through SP1's endpoint", async () => {
    const request = buildApprovalRequest();
    const { api, requests } = answering(200, { data: [request], meta: { page: { cursor: null, hasMore: false, limit: 20 } } });
    expect(await api.list({ organizationId: "OrgAaaaaaaaaaaaaaaaaa", status: "pending" })).toEqual({ ok: true, data: { items: [request], cursor: null, hasMore: false } });
    expect(requests[0]).toEqual({ method: "GET", path: "/v1/organizations/OrgAaaaaaaaaaaaaaaaaa/approval-requests", query: { status: "pending" } });
  });

  it("maps 403 SELF_APPROVAL_FORBIDDEN to its i18n message", async () => {
    const { api, requests } = answering(403, { error: { code: "SELF_APPROVAL_FORBIDDEN", message: "x", requestId: "r" } });
    expect(await api.approve({ approvalRequestId: "Ap1qW2eR3tY4uI5oP6aS" })).toEqual({
      ok: false,
      error: { status: 403, code: "SELF_APPROVAL_FORBIDDEN", messageKey: "errors.SELF_APPROVAL_FORBIDDEN" },
    });
    expect(requests[0]).toMatchObject({ method: "POST", path: "/v1/approval-requests/Ap1qW2eR3tY4uI5oP6aS/approve", body: {} });
  });

  it("maps unknown codes, network failures and bad bodies to generic messages", async () => {
    expect(await answering(409, { error: { code: "SOMETHING_NEW" } }).api.reject({ approvalRequestId: "x", reason: "no" })).toMatchObject({ ok: false, error: { code: "INTERNAL_ERROR" } });
    const offline = createApprovalRequestsApi(() => Promise.reject(new TypeError("fetch failed")));
    expect(await offline.list({ organizationId: "o" })).toMatchObject({ ok: false, error: { status: 0, messageKey: "errors.UPSTREAM_UNAVAILABLE" } });
    expect(await answering(200, { data: [{ id: 1 }], meta: { page: { cursor: null, hasMore: false } } }).api.list({ organizationId: "o" })).toMatchObject({ ok: false, error: { code: "UPSTREAM_UNAVAILABLE" } });
  });
});
