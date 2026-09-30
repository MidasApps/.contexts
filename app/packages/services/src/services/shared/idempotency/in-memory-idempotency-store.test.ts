import { describe, expect, it } from "vitest";
import { fixedClock } from "../clock/clock.ts";
import { createInMemoryIdempotencyStore } from "./in-memory-idempotency-store.ts";

const clock = fixedClock("2026-09-29T12:00:00.000Z");

describe("in-memory idempotency store", () => {
  it("replays the completed response for the same key and request", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    expect(await store.begin("scope-1", "hash-a")).toEqual({ kind: "new" });
    expect(await store.begin("scope-1", "hash-a")).toEqual({ kind: "in-flight" });
    await store.complete("scope-1", { status: 201, body: '{"data":{"id":"1"}}' });
    expect(await store.begin("scope-1", "hash-a")).toEqual({ kind: "replay", response: { status: 201, body: '{"data":{"id":"1"}}' } });
    expect(await store.begin("scope-1", "hash-b")).toEqual({ kind: "conflict" });
  });

  it("forgets a released in-flight key so the client can retry", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    await store.begin("scope-2", "hash-a");
    await store.release("scope-2");
    expect(await store.begin("scope-2", "hash-a")).toEqual({ kind: "new" });
  });

  it("never releases a completed record", async () => {
    const store = createInMemoryIdempotencyStore({ clock });
    await store.begin("scope-3", "hash-a");
    await store.complete("scope-3", { status: 204, body: null });
    await store.release("scope-3");
    expect((await store.begin("scope-3", "hash-a")).kind).toBe("replay");
  });
});
