import { dataEnvelope, defineEndpoint, OrganizationIdSchema, PageQuerySchema, type Principal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInMemoryAccessStore } from "../../access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "../../access/composition.ts";
import { createInMemoryAuditLogWriter } from "../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../clock/clock.ts";
import { createInMemoryIdempotencyStore } from "../idempotency/in-memory-idempotency-store.ts";
import { createLogger, type LogRecord } from "../observability/logger.ts";
import { createInMemoryRateLimiter } from "../rate-limit/in-memory-rate-limiter.ts";
import type { RateLimitPolicy } from "../rate-limit/rate-limit-policies.ts";
import { dataResponse, noContentResponse } from "./api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "./api-route.ts";
import type { ErrorEnvelope } from "./error-envelope.ts";

const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;

const NOW = "2026-09-29T12:00:00.000Z";
const REQUEST_ID = "01K6B0000000000000000000RQ";
const KEY_A = "01K6B00000000000000000000A";

const getThing = defineEndpoint({
  id: "test.getThing",
  method: "GET",
  path: "/v1/things/{thingId}",
  auth: "user",
  params: z.object({ thingId: z.string().min(1) }),
  query: PageQuerySchema,
  responses: { 200: dataEnvelope(z.object({ thingId: z.string() })) },
  summary: "Reads a thing.",
});

const createThing = defineEndpoint({
  id: "test.createThing",
  method: "POST",
  path: "/v1/things",
  auth: "principal",
  body: z.strictObject({ name: z.string().min(1), count: z.int() }),
  responses: { 201: dataEnvelope(z.object({ id: z.string() })) },
  idempotency: "optional",
  summary: "Creates a thing.",
});

const payThing = defineEndpoint({
  id: "test.payThing",
  method: "POST",
  path: "/v1/things/{thingId}/pay",
  auth: "user",
  params: z.object({ thingId: z.string().min(1) }),
  responses: { 204: null },
  idempotency: "required",
  summary: "Pays a thing.",
});

const switchThing = defineEndpoint({
  id: "test.switchThing",
  method: "PUT",
  path: "/v1/switch",
  auth: "user",
  responses: { 204: null },
  rateLimit: "test-per-principal",
  summary: "Switches.",
});

const redeemThing = defineEndpoint({
  id: "test.redeemThing",
  method: "POST",
  path: "/v1/redeem",
  auth: "none",
  body: z.strictObject({ code: z.string() }),
  responses: { 204: null },
  rateLimit: "test-failures",
  summary: "Redeems a code.",
});

const policies: RateLimitPolicy[] = [
  { id: "test-per-principal", limit: 1, windowMs: 60_000, subject: "principal", counts: "requests" },
  { id: "test-failures", limit: 2, windowMs: 60_000, subject: "ip", counts: "failures" },
  { id: "api-key-failure", limit: 2, windowMs: 60_000, subject: "ip", counts: "failures" },
];

const PRINCIPALS: Record<string, Principal> = {
  "user-token": { type: "user", uid: "user-1", mfa: false } as Principal,
  "device-token": { type: "device", deviceId: "dev-1", tenantId: "org-a" } as Principal,
};

const setup = () => {
  const clock = fixedClock(NOW);
  const records: LogRecord[] = [];
  const bearerCalls: string[] = [];
  const idempotency = createInMemoryIdempotencyStore({ clock });
  const deps: ApiRouteDeps = {
    logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => records.push(record) }),
    clock,
    rateLimiter: createInMemoryRateLimiter({ clock, policies }),
    rateLimitPolicies: policies,
    idempotency,
    apiKeyPrefix: "core",
    verifyBearer: ({ token }) => {
      bearerCalls.push(token);
      return Promise.resolve(PRINCIPALS[token] ?? null);
    },
    access: createAccessCore({ readers: createInMemoryAccessStore(), clock }),
    audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
  };
  return { deps, records, bearerCalls, idempotency };
};

const call = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  new Request(`http://localhost${url}`, { method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ?? null });

const bearer = (token = "user-token") => ({ authorization: `Bearer ${token}` });
const json = { "content-type": "application/json" };

describe("withApiRoute: authentication", () => {
  it("answers 401 without a Bearer credential, with a bad scheme, an unknown token, or a query token", async () => {
    const { deps } = setup();
    const route = withApiRoute(getThing, deps, () => Promise.resolve(dataResponse({ data: { thingId: "x" } })));
    const cases = [
      call("/v1/things/t1"),
      call("/v1/things/t1", { headers: { authorization: "Basic dXNlcg==" } }),
      call("/v1/things/t1", { headers: bearer("nope") }),
      call("/v1/things/t1?apiKey=user-token&token=user-token"),
    ];
    for (const request of cases) {
      const response = await route(request);
      expect(response.status).toBe(401);
      expect((await errorOf(response)).code).toBe("UNAUTHORIZED");
    }
  });

  it("answers 403 when a user-only endpoint is called by a device", async () => {
    const { deps } = setup();
    const route = withApiRoute(getThing, deps, () => Promise.resolve(dataResponse({ data: { thingId: "x" } })));
    const response = await route(call("/v1/things/t1", { headers: bearer("device-token") }));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
  });

  it("gives the handler the principal, parsed input, request id and access scope", async () => {
    const { deps } = setup();
    let seen: unknown;
    const route = withApiRoute(getThing, deps, async (context) => {
      const decision = await context.authorize({ principal: context.principal, permission: "core.project.read", node: { level: "platform" } });
      seen = { principal: context.principal, input: context.input, requestId: context.requestId, allowed: decision.allowed };
      return dataResponse({ data: { thingId: context.input.params.thingId } });
    });
    const response = await route(call("/v1/things/t%201?limit=5", { headers: { ...bearer(), "x-request-id": REQUEST_ID } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(seen).toEqual({
      principal: { type: "user", uid: "user-1", mfa: false },
      input: { params: { thingId: "t 1" }, query: { limit: 5 }, body: undefined },
      requestId: REQUEST_ID,
      allowed: false,
    });
  });
});

describe("withApiRoute: validation", () => {
  it("answers 400 VALIDATION_FAILED listing every issue at once, including the Idempotency-Key", async () => {
    const { deps } = setup();
    const route = withApiRoute(createThing, deps, () => Promise.resolve(dataResponse({ data: { id: "1" } }, { status: 201 })));
    const response = await route(
      call("/v1/things", { method: "POST", headers: { ...bearer(), ...json, "idempotency-key": "not-a-ulid" }, body: '{"count":"2","extra":1}' }),
    );
    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect((error.details ?? []).map((detail: { field: string }) => detail.field).sort()).toEqual(["(body)", "Idempotency-Key", "count", "name"]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const { deps } = setup();
    const route = withApiRoute(createThing, deps, () => Promise.resolve(noContentResponse()));
    const response = await route(call("/v1/things", { method: "POST", headers: { ...bearer(), ...json }, body: "{" }));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).details).toEqual([{ field: "(body)", issue: "INVALID_JSON" }]);
  });

  it("requires the Idempotency-Key when the descriptor says so", async () => {
    const { deps } = setup();
    const route = withApiRoute(payThing, deps, () => Promise.resolve(noContentResponse()));
    const response = await route(call("/v1/things/t1/pay", { method: "POST", headers: bearer() }));
    expect((await errorOf(response)).details).toEqual([{ field: "Idempotency-Key", issue: "REQUIRED" }]);
  });
});

describe("withApiRoute: idempotency", () => {
  const post = (body: string, key = KEY_A) =>
    call("/v1/things", { method: "POST", headers: { ...bearer(), ...json, "idempotency-key": key }, body });

  it("replays the first response for the same key and body, without running the handler again", async () => {
    const { deps } = setup();
    let runs = 0;
    const route = withApiRoute(createThing, deps, () => {
      runs += 1;
      return Promise.resolve(dataResponse({ data: { id: `thing-${runs}` } }, { status: 201, location: `/v1/things/thing-${runs}` }));
    });
    const first = await route(post('{"name":"a","count":1}'));
    const replay = await route(post('{"count":1,"name":"a"}'));
    expect(runs).toBe(1);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("location")).toBe("/v1/things/thing-1");
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(await replay.json()).toEqual(await first.json());
  });

  it("answers 409 IDEMPOTENCY_KEY_REUSED for another body and 409 IN_PROGRESS while in flight", async () => {
    const { deps, idempotency } = setup();
    const route = withApiRoute(createThing, deps, () => Promise.resolve(dataResponse({ data: { id: "1" } }, { status: 201 })));
    await route(post('{"name":"a","count":1}'));
    const reused = await route(post('{"name":"b","count":1}'));
    expect(reused.status).toBe(409);
    expect((await errorOf(reused)).code).toBe("IDEMPOTENCY_KEY_REUSED");

    // A retry that arrives while the first attempt still runs.
    const keyB = "01K6B00000000000000000000B";
    let busy: Response | undefined;
    const slowRoute = withApiRoute(createThing, { ...deps, idempotency }, async () => {
      busy ??= await slowRoute(post('{"name":"c","count":1}', keyB));
      return dataResponse({ data: { id: "2" } }, { status: 201 });
    });
    expect((await slowRoute(post('{"name":"c","count":1}', keyB))).status).toBe(201);
    if (busy === undefined) throw new Error("the retry did not run");
    expect(busy.status).toBe(409);
    expect(busy.headers.get("retry-after")).toBe("1");
    expect((await errorOf(busy)).code).toBe("IDEMPOTENCY_REQUEST_IN_PROGRESS");
  });

  it("never stores a one-time secret: a replay answers 409 CONFLICT with the resource location", async () => {
    const { deps } = setup();
    let runs = 0;
    const route = withApiRoute(createThing, { ...deps, oneTimeSecretEndpoints: new Set(["test.createThing"]) }, () => {
      runs += 1;
      return Promise.resolve(dataResponse({ data: { id: "k1", secret: "s3cr3t" } }, { status: 201, location: "/v1/things/k1" }));
    });
    expect((await route(post('{"name":"a","count":1}'))).status).toBe(201);
    const replay = await route(post('{"name":"a","count":1}'));
    expect(runs).toBe(1);
    expect(replay.status).toBe(409);
    expect(replay.headers.get("location")).toBe("/v1/things/k1");
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    const text = await replay.text();
    expect(text).not.toContain("s3cr3t");
    expect(JSON.parse(text)).toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("replays a stored error with the replaying request's id", async () => {
    const { deps } = setup();
    const route = withApiRoute(createThing, deps, ({ requestId }) =>
      Promise.resolve(Response.json({ error: { code: "UNKNOWN_PERMISSION", message: "x", requestId } }, { status: 422 })),
    );
    await route(call("/v1/things", { method: "POST", headers: { ...bearer(), ...json, "idempotency-key": KEY_A, "x-request-id": "01K6B000000000000000000RQ1" }, body: '{"name":"a","count":1}' }));
    const replay = await route(call("/v1/things", { method: "POST", headers: { ...bearer(), ...json, "idempotency-key": KEY_A, "x-request-id": "01K6B000000000000000000RQ2" }, body: '{"name":"a","count":1}' }));
    expect(replay.status).toBe(422);
    expect((await errorOf(replay)).requestId).toBe("01K6B000000000000000000RQ2");
  });

  it("releases the key when the handler throws, so the client can retry", async () => {
    const { deps } = setup();
    let fail = true;
    const route = withApiRoute(createThing, deps, () => {
      if (fail) throw new Error("db exploded at /srv/secret.sql");
      return Promise.resolve(dataResponse({ data: { id: "1" } }, { status: 201 }));
    });
    const crashed = await route(post('{"name":"a","count":1}'));
    expect(crashed.status).toBe(500);
    expect(await crashed.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", message: "Internal error." } });
    fail = false;
    expect((await route(post('{"name":"a","count":1}'))).status).toBe(201);
  });
});

describe("withApiRoute: rate limits", () => {
  it("limits per principal after authentication and sends the rate limit headers", async () => {
    const { deps } = setup();
    const route = withApiRoute(switchThing, deps, () => Promise.resolve(noContentResponse()));
    const first = await route(call("/v1/switch", { method: "PUT", headers: bearer() }));
    expect(first.status).toBe(204);
    expect(first.headers.get("x-ratelimit-remaining")).toBe("0");
    const second = await route(call("/v1/switch", { method: "PUT", headers: bearer() }));
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    expect((await errorOf(second)).code).toBe("RATE_LIMITED");
    expect((await route(call("/v1/switch", { method: "PUT" }))).status).toBe(401);
  });

  it("counts only failures of a failure policy, per IP, and blocks before the handler", async () => {
    const { deps } = setup();
    let runs = 0;
    const route = withApiRoute(redeemThing, deps, (context) => {
      runs += 1;
      return Promise.resolve(
        context.input.body.code === "good"
          ? noContentResponse()
          : Response.json({ error: { code: "UNAUTHORIZED", message: "x", requestId: context.requestId } }, { status: 401 }),
      );
    });
    const redeem = (code: string, ip = "203.0.113.7") =>
      route(call("/v1/redeem", { method: "POST", headers: { ...json, "x-forwarded-for": `10.9.9.9, ${ip}` }, body: JSON.stringify({ code }) }));
    expect((await redeem("good")).status).toBe(204);
    expect((await redeem("bad")).status).toBe(401);
    expect((await redeem("bad")).status).toBe(401);
    expect((await redeem("good")).status).toBe(429);
    expect(runs).toBe(3);
    expect((await redeem("good", "198.51.100.1")).status).toBe(204);
  });

  it("reserves a failure slot before the work, so a parallel burst cannot pass the lockout", async () => {
    const { deps } = setup();
    let runs = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const route = withApiRoute(redeemThing, deps, async (context) => {
      runs += 1;
      await gate;
      return Response.json({ error: { code: "UNAUTHORIZED", message: "x", requestId: context.requestId } }, { status: 401 });
    });
    const redeem = () => route(call("/v1/redeem", { method: "POST", headers: { ...json, "x-forwarded-for": "203.0.113.8" }, body: '{"code":"bad"}' }));
    const burst = Array.from({ length: 6 }, () => redeem());
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const statuses = (await Promise.all(burst)).map((response) => response.status).sort();
    expect(statuses).toEqual([401, 401, 429, 429, 429, 429]);
    expect(runs).toBe(2);
  });

  it("gives the reserved slot back when the work succeeds", async () => {
    const { deps } = setup();
    const route = withApiRoute(redeemThing, deps, () => Promise.resolve(noContentResponse()));
    const redeem = () => route(call("/v1/redeem", { method: "POST", headers: { ...json, "x-forwarded-for": "203.0.113.10" }, body: '{"code":"good"}' }));
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await redeem()).status).toBe(204);
    expect((await redeem()).headers.get("x-ratelimit-remaining")).toBe("2");
  });

  it("locks out a parallel burst of bad API keys before the credentials are checked", async () => {
    const { deps, bearerCalls } = setup();
    const route = withApiRoute(createThing, deps, () => Promise.resolve(noContentResponse()));
    const attempt = () =>
      route(call("/v1/things", { method: "POST", headers: { ...json, authorization: "Bearer core_PUB_bad", "x-forwarded-for": "203.0.113.11" }, body: '{"name":"a","count":1}' }));
    const statuses = (await Promise.all(Array.from({ length: 5 }, () => attempt()))).map((response) => response.status).sort();
    expect(statuses).toEqual([401, 401, 429, 429, 429]);
    expect(bearerCalls).toHaveLength(2);
  });

  it("locks out API key failures per IP before the credential is checked", async () => {
    const { deps, bearerCalls } = setup();
    const route = withApiRoute(createThing, deps, () => Promise.resolve(noContentResponse()));
    const attempt = () =>
      route(call("/v1/things", { method: "POST", headers: { ...json, authorization: "Bearer core_PUB_bad", "x-forwarded-for": "203.0.113.9" }, body: '{"name":"a","count":1}' }));
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
    expect(bearerCalls).toEqual(["core_PUB_bad", "core_PUB_bad"]);
  });
});

describe("withApiRoute: boundary", () => {
  it("logs one line per request with the endpoint id and never the credential", async () => {
    const { deps, records } = setup();
    const route = withApiRoute(getThing, deps, () => Promise.resolve(dataResponse({ data: { thingId: "x" } })));
    await route(call("/v1/things/t1", { headers: bearer() }));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: "info", message: "test_get_thing_ok", status: 200 });
    expect(JSON.stringify(records)).not.toContain("user-token");
  });
});

describe("withApiRoute: denials and impersonation", () => {
  const IMPERSONATED = { type: "user", uid: "user-1", mfa: false, impersonation: { sessionId: "imp-1", staffUid: "staff-1" } } as Principal;
  const organization = { level: "organization", tenantId: OrganizationIdSchema.parse("org-a") } as const;

  it("logs the deny reason of a refused request, never in the response", async () => {
    const { deps, records } = setup();
    const route = withApiRoute(getThing, deps, async ({ principal, authorize }) => {
      const decision = await authorize({ principal, permission: "core.organization.read", node: organization });
      return decision.allowed ? noContentResponse() : new Response(null, { status: 403 });
    });
    const response = await route(call("/v1/things/t1", { headers: bearer() }));
    expect(response.status).toBe(403);
    expect(records.find((record) => record.message === "access_denied")).toMatchObject({ endpointId: "test.getThing", reason: "NODE_NOT_FOUND" });
  });

  it("reports every request of an impersonated principal with its status and deny reason", async () => {
    const { deps } = setup();
    const reported: unknown[] = [];
    const withHook: ApiRouteDeps = {
      ...deps,
      verifyBearer: ({ token }) => Promise.resolve(token === "imp-token" ? IMPERSONATED : (PRINCIPALS[token] ?? null)),
      onImpersonatedRequest: (request) => Promise.resolve(void reported.push(request)),
    };
    const route = withApiRoute(getThing, withHook, async ({ principal, authorize }) => {
      const decision = await authorize({ principal, permission: "core.organization.read", node: organization });
      return decision.allowed ? noContentResponse() : new Response(null, { status: 404 });
    });
    expect((await route(call("/v1/things/t1", { headers: bearer("imp-token") }))).status).toBe(404);
    expect((await route(call("/v1/things/t1", { headers: bearer() }))).status).toBe(404);
    expect(reported).toMatchObject([{ principal: IMPERSONATED, endpointId: "test.getThing", method: "GET", status: 404, denyReason: "NODE_NOT_FOUND" }]);
  });
});
