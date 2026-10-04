import type { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../clock/clock.ts";
import { createFirebaseAdmin } from "../firebase/firebase-admin.ts";
import { createFirestoreRateLimiter, RATE_LIMIT_BUCKETS_COLLECTION } from "./firestore-rate-limiter.ts";
import type { RateLimitPolicy } from "./rate-limit-policies.ts";
import { rateLimitBucketId } from "./rate-limiter.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});

const policies: RateLimitPolicy[] = [
  { id: "test-five-per-minute", limit: 5, windowMs: 60_000, subject: "ip", counts: "requests" },
];

const movableClock = (iso: string) => {
  let current = Date.parse(iso);
  const clock: Clock = { now: () => new Date(current) };
  return {
    clock,
    advance: (ms: number) => {
      current += ms;
    },
  };
};

beforeEach(async () => {
  await firestore.recursiveDelete(firestore.collection(RATE_LIMIT_BUCKETS_COLLECTION));
});

describe("Firestore rate limiter", () => {
  it("stores a hashed bucket with a TTL field and resets it when the window elapses", async () => {
    const { clock, advance } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createFirestoreRateLimiter({ firestore, clock, policies });
    const allowed: boolean[] = [];
    for (let index = 0; index < 6; index += 1)
      allowed.push((await limiter.consume("test-five-per-minute", "10.0.0.1")).allowed);
    expect(allowed).toEqual([true, true, true, true, true, false]);

    const stored = (
      await firestore
        .collection(RATE_LIMIT_BUCKETS_COLLECTION)
        .doc(rateLimitBucketId("test-five-per-minute", "10.0.0.1"))
        .get()
    ).data();
    expect(stored).toMatchObject({ policyId: "test-five-per-minute", count: 5 });
    expect((stored?.["expiresAt"] as Timestamp).toDate().toISOString()).toBe("2026-09-29T12:01:00.000Z");
    expect(JSON.stringify(stored)).not.toContain("10.0.0.1");

    advance(60_000);
    expect(await limiter.consume("test-five-per-minute", "10.0.0.1")).toMatchObject({ allowed: true, remaining: 4 });
    expect((await limiter.peek("test-five-per-minute", "10.0.0.1")).remaining).toBe(4);
  });

  it("refunds a consumed hit in its window only", async () => {
    const { clock, advance } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createFirestoreRateLimiter({ firestore, clock, policies });
    const consumed = await limiter.consume("test-five-per-minute", "10.0.0.2");
    expect(await limiter.refund("test-five-per-minute", "10.0.0.2", consumed)).toMatchObject({ remaining: 5 });
    const again = await limiter.consume("test-five-per-minute", "10.0.0.2");
    advance(60_000);
    await limiter.consume("test-five-per-minute", "10.0.0.2");
    expect(await limiter.refund("test-five-per-minute", "10.0.0.2", again)).toBeNull();
    expect((await limiter.peek("test-five-per-minute", "10.0.0.2")).remaining).toBe(4);
  });

  // limit + 1 transactions contend on one bucket: enough to prove that exactly `limit` pass
  // and the extra one is refused. The emulator serializes them with lock waits and client
  // backoff, whose total grows with every extra contender (8 hits took 4-13 s and timed out
  // under load), so the count stays at the minimum that still overshoots the limit.
  it("counts concurrent hits exactly", { timeout: 90_000 }, async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const limiter = createFirestoreRateLimiter({ firestore, clock, policies });
    const contenders = 6;
    const results = await Promise.all(
      Array.from({ length: contenders }, () => limiter.consume("test-five-per-minute", "10.0.0.2")),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(contenders - 5);
    const stored = await firestore
      .collection(RATE_LIMIT_BUCKETS_COLLECTION)
      .doc(rateLimitBucketId("test-five-per-minute", "10.0.0.2"))
      .get();
    expect(stored.get("count")).toBe(5);
  });
});
