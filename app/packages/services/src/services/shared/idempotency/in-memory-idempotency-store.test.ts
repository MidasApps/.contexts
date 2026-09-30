import { describe, expect, it } from "vitest";
import { fixedClock, type Clock } from "../clock/clock.ts";
import { IN_FLIGHT_LEASE_MS } from "./idempotency-decision.ts";
import { createInMemoryIdempotencyStore } from "./in-memory-idempotency-store.ts";

const clock = fixedClock("2026-09-29T12:00:00.000Z");

const attemptOf = (begin: { kind: string; attemptId?: string }): string => {
  if (begin.kind !== "new" || begin.attemptId === undefined) throw new Error(`expected a new attempt, got ${begin.kind}`);
  return begin.attemptId;
};

describe("in-memory idempotency store", () => {
  it("replays the completed response for the same key and request", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    const attempt = attemptOf(await store.begin("scope-1", "hash-a"));
    expect(await store.begin("scope-1", "hash-a")).toEqual({ kind: "in-flight" });
    await store.complete("scope-1", attempt, { status: 201, body: '{"data":{"id":"1"}}' });
    expect(await store.begin("scope-1", "hash-a")).toEqual({ kind: "replay", response: { status: 201, body: '{"data":{"id":"1"}}' } });
    expect(await store.begin("scope-1", "hash-b")).toEqual({ kind: "conflict" });
  });

  it("forgets a released in-flight key so the client can retry", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    const attempt = attemptOf(await store.begin("scope-2", "hash-a"));
    await store.release("scope-2", attempt);
    expect((await store.begin("scope-2", "hash-a")).kind).toBe("new");
  });

  it("never releases a completed record", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    const attempt = attemptOf(await store.begin("scope-3", "hash-a"));
    await store.complete("scope-3", attempt, { status: 204, body: null });
    await store.release("scope-3", attempt);
    expect((await store.begin("scope-3", "hash-a")).kind).toBe("replay");
  });

  it("ignores a late attempt whose lease another attempt took over", async () => {
    let now = Date.parse("2026-09-29T12:00:00.000Z");
    const movable: Clock = { now: () => new Date(now) };
    const store = createInMemoryIdempotencyStore({ clock: movable });
    const stale = attemptOf(await store.begin("scope-4", "hash-a"));
    now += IN_FLIGHT_LEASE_MS;
    const current = attemptOf(await store.begin("scope-4", "hash-a"));
    expect(current).not.toBe(stale);

    await store.release("scope-4", stale);
    await store.complete("scope-4", stale, { status: 500, body: null });
    expect(await store.begin("scope-4", "hash-a")).toEqual({ kind: "in-flight" });
    await store.complete("scope-4", current, { status: 204, body: null });
    expect((await store.begin("scope-4", "hash-a")).kind).toBe("replay");
  });
});
