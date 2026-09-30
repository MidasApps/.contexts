import { describe, expect, it } from "vitest";
import { decideBegin, IDEMPOTENCY_TTL_MS, IN_FLIGHT_LEASE_MS, type IdempotencyRecord } from "./idempotency-decision.ts";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const plus = (ms: number) => new Date(NOW.getTime() + ms);

const record = (overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord => ({
  requestHash: "hash-a",
  state: "in-flight",
  response: null,
  expiresAt: plus(IDEMPOTENCY_TTL_MS),
  leaseUntil: plus(IN_FLIGHT_LEASE_MS),
  attemptId: "attempt-new",
  ...overrides,
});

describe("decideBegin", () => {
  it("starts a new in-flight record for 24 h when none exists", () => {
    expect(decideBegin({ record: null, requestHash: "hash-a", now: NOW, attemptId: "attempt-new" })).toEqual({ begin: { kind: "new", attemptId: "attempt-new" }, write: record() });
  });

  it("replays a completed record with the same request hash", () => {
    const response = { status: 201, body: '{"data":{}}', location: "/v1/things/1" };
    expect(decideBegin({ record: record({ state: "done", response }), requestHash: "hash-a", now: NOW, attemptId: "x" })).toEqual({
      begin: { kind: "replay", response },
      write: null,
    });
  });

  it("reports a conflict when the same key comes with another request", () => {
    expect(decideBegin({ record: record({ state: "done" }), requestHash: "hash-b", now: NOW, attemptId: "x" }).begin).toEqual({ kind: "conflict" });
  });

  it("reports in-flight while the lease holds, and takes over a stale lease", () => {
    expect(decideBegin({ record: record(), requestHash: "hash-a", now: NOW, attemptId: "x" }).begin).toEqual({ kind: "in-flight" });
    const stale = decideBegin({ record: record({ leaseUntil: NOW, attemptId: "attempt-old" }), requestHash: "hash-a", now: NOW, attemptId: "attempt-new" });
    expect(stale).toEqual({ begin: { kind: "new", attemptId: "attempt-new" }, write: record() });
  });

  it("treats an expired record as absent", () => {
    const expired = record({ requestHash: "hash-b", state: "done", expiresAt: NOW });
    expect(decideBegin({ record: expired, requestHash: "hash-a", now: NOW, attemptId: "a" }).begin).toEqual({ kind: "new", attemptId: "a" });
  });
});
