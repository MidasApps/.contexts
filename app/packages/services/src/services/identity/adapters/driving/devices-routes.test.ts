import { describe, expect, it } from "vitest";
import { createInMemoryAccessStore } from "../../../access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "../../../access/composition.ts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import type { ApiRouteDeps } from "../../../shared/http/api-route.ts";
import { createInMemoryIdempotencyStore } from "../../../shared/idempotency/in-memory-idempotency-store.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createInMemoryRateLimiter } from "../../../shared/rate-limit/in-memory-rate-limiter.ts";
import { buildDeviceWorld, DEVICE_NOW } from "../../application/use-cases/device.fixture.ts";
import { buildDevicesRoutes } from "./devices-routes.ts";

// The `/v1` pipeline over in-memory adapters; redeem needs no Bearer.
const pipelineAt = (now: string): ApiRouteDeps => {
  const clock = fixedClock(now);
  return {
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    clock,
    rateLimiter: createInMemoryRateLimiter({ clock }),
    idempotency: createInMemoryIdempotencyStore({ clock }),
    apiKeyPrefix: "core",
    verifyBearer: () => Promise.resolve(null),
    access: createAccessCore({ readers: createInMemoryAccessStore(), clock }),
    audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
  };
};

const redeem = async (routes: ReturnType<typeof buildDevicesRoutes>, code: string, ip: string): Promise<Response> => {
  const handler = routes["identity.redeemDeviceActivation"];
  if (handler === undefined) throw new Error("no redeem route");
  return handler(new Request("http://localhost/v1/device-activations/redeem", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ code }) }));
};

describe("device redeem lockout", () => {
  it("answers 429 to the 6th wrong code from one IP within 15 minutes, other IPs unaffected", async () => {
    const world = await buildDeviceWorld();
    const routes = buildDevicesRoutes({ pipeline: pipelineAt(DEVICE_NOW), devices: world.devices });
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await redeem(routes, "00000000", "203.0.113.5")).status).toBe(401);
    const locked = await redeem(routes, await world.activationCode(), "203.0.113.5");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).not.toBeNull();
    expect((await redeem(routes, "00000000", "203.0.113.6")).status).toBe(401);
  });

  it("does not count successful redeems against the IP", async () => {
    const world = await buildDeviceWorld();
    const routes = buildDevicesRoutes({ pipeline: pipelineAt(DEVICE_NOW), devices: world.devices });
    for (let attempt = 0; attempt < 6; attempt += 1) expect((await redeem(routes, await world.activationCode(), "203.0.113.7")).status).toBe(200);
  });
});
