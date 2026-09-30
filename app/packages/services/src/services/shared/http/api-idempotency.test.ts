import { CORE_ENDPOINTS, type Principal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ONE_TIME_SECRET_ENDPOINT_IDS, principalKey, replayResponse } from "./api-idempotency.ts";

describe("principalKey", () => {
  it("scopes an impersonated user apart from the user and from other sessions", () => {
    const own = { type: "user", uid: "u1", mfa: false } as Principal;
    const impersonated = { ...own, impersonation: { sessionId: "imp-1", staffUid: "staff-1" } } as Principal;
    const other = { ...own, impersonation: { sessionId: "imp-2", staffUid: "staff-1" } } as Principal;
    expect(principalKey(own, "ip")).toBe("user:u1");
    expect(principalKey(impersonated, "ip")).toBe("user:u1:imp:imp-1");
    expect(principalKey(other, "ip")).not.toBe(principalKey(impersonated, "ip"));
  });
});

describe("replayResponse", () => {
  it("answers a redacted success with 409 CONFLICT and the created resource's location", async () => {
    const replay = replayResponse({ status: 201, body: null, location: "/v1/api-keys/k1", redacted: true }, "req-2");
    expect(replay.status).toBe(409);
    expect(replay.headers.get("location")).toBe("/v1/api-keys/k1");
    expect(await replay.json()).toMatchObject({ error: { code: "CONFLICT", requestId: "req-2" } });
  });

  it("rewrites the request id of a stored error envelope and leaves success bodies alone", async () => {
    const error = replayResponse({ status: 404, body: '{"error":{"code":"NOT_FOUND","message":"x","requestId":"req-1"}}' }, "req-2");
    expect(await error.json()).toEqual({ error: { code: "NOT_FOUND", message: "x", requestId: "req-2" } });
    const success = replayResponse({ status: 200, body: '{"data":{"requestId":"req-1"}}' }, "req-2");
    expect(await success.json()).toEqual({ data: { requestId: "req-1" } });
  });
});

describe("ONE_TIME_SECRET_ENDPOINT_IDS", () => {
  it("names declared endpoints only", () => {
    const declared = new Set(CORE_ENDPOINTS.map((endpoint) => endpoint.id));
    expect([...ONE_TIME_SECRET_ENDPOINT_IDS].filter((id) => !declared.has(id))).toEqual([]);
  });
});
