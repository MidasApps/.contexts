import type { Firestore, Transaction } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { runInTransaction } from "./transaction-runner.ts";

type RunTransaction = Firestore["runTransaction"];

const makeFakeFirestore = () => {
  const calls: Array<{ maxAttempts: number | undefined }> = [];
  const runTransaction = (async (fn: (tx: Transaction) => Promise<unknown>, options?: { maxAttempts?: number }) => {
    calls.push({ maxAttempts: options?.maxAttempts });
    // Test double: the callback never touches the transaction here.
    return fn({} as Transaction);
  }) as RunTransaction;
  return { firestore: { runTransaction }, calls };
};

describe("runInTransaction", () => {
  it("retries up to 5 attempts by default and returns the callback result", async () => {
    const { firestore, calls } = makeFakeFirestore();
    await expect(runInTransaction(firestore, () => Promise.resolve("done"))).resolves.toBe("done");
    expect(calls).toEqual([{ maxAttempts: 5 }]);
  });

  it("passes an explicit attempt budget through", async () => {
    const { firestore, calls } = makeFakeFirestore();
    await runInTransaction(firestore, () => Promise.resolve(undefined), { maxAttempts: 2 });
    expect(calls).toEqual([{ maxAttempts: 2 }]);
  });

  it("propagates a callback error", async () => {
    const { firestore } = makeFakeFirestore();
    const failing = runInTransaction(firestore, () => Promise.reject(new Error("conflict")));
    await expect(failing).rejects.toThrow("conflict");
  });
});
