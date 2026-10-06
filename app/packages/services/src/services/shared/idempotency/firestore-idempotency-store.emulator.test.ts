import type { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../clock/clock.ts";
import { createFirebaseAdmin } from "../firebase/firebase-admin.ts";
import { createFirestoreIdempotencyStore, IDEMPOTENCY_RECORDS_COLLECTION } from "./firestore-idempotency-store.ts";
import { idempotencyScopeKey } from "./idempotency-store.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});

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

const scope = (key: string) =>
  idempotencyScopeKey({ principalKey: "user:u1", endpointId: "tenancy.createProject", idempotencyKey: key });

beforeEach(async () => {
  await firestore.recursiveDelete(firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION));
});

describe("Firestore idempotency store", () => {
  it("replays the stored response and keeps it 24 h with a TTL field", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const store = createFirestoreIdempotencyStore({ firestore, clock });
    const key = scope("01K6B00000000000000000000A");
    const response = { status: 201, body: '{"data":{"id":"p1"}}', location: "/v1/projects/p1" };

    const begin = await store.begin(key, "hash-a");
    expect(begin.kind).toBe("new");
    await store.complete(key, begin.kind === "new" ? begin.attemptId : "", response);

    expect(await store.begin(key, "hash-a")).toEqual({ kind: "replay", response });
    const stored = (await firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).doc(key).get()).data();
    expect(stored).toMatchObject({ state: "done", requestHash: "hash-a" });
    expect((stored?.["expiresAt"] as Timestamp).toDate().toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });

  it("reports a conflict for another request under the same key", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const store = createFirestoreIdempotencyStore({ firestore, clock });
    const key = scope("01K6B00000000000000000000B");
    const begin = await store.begin(key, "hash-a");
    await store.complete(key, begin.kind === "new" ? begin.attemptId : "", { status: 204, body: null });
    expect(await store.begin(key, "hash-b")).toEqual({ kind: "conflict" });
  });

  it("reports in-flight until the lease ends, and lets a released key start over", async () => {
    const { clock, advance } = movableClock("2026-09-29T12:00:00.000Z");
    const store = createFirestoreIdempotencyStore({ firestore, clock });
    const key = scope("01K6B00000000000000000000C");
    const first = await store.begin(key, "hash-a");
    expect(first.kind).toBe("new");
    expect(await store.begin(key, "hash-a")).toEqual({ kind: "in-flight" });
    advance(60_000);
    const second = await store.begin(key, "hash-a");
    expect(second.kind).toBe("new");
    // The first attempt lost its lease: its late release leaves the second attempt's record.
    await store.release(key, first.kind === "new" ? first.attemptId : "");
    expect((await firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).doc(key).get()).exists).toBe(true);
    await store.release(key, second.kind === "new" ? second.attemptId : "");
    expect((await firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).doc(key).get()).exists).toBe(false);
  });

  it("lets exactly one of two concurrent requests with the same key run", async () => {
    const { clock } = movableClock("2026-09-29T12:00:00.000Z");
    const store = createFirestoreIdempotencyStore({ firestore, clock });
    const key = scope("01K6B00000000000000000000D");
    const results = await Promise.all([store.begin(key, "hash-a"), store.begin(key, "hash-a")]);
    expect(results.map((result) => result.kind).sort()).toEqual(["in-flight", "new"]);
  });
});
