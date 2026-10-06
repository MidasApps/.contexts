import { describe, expect, it } from "vitest";
import { createMemorySecureStore } from "./memory-secure-store.ts";

describe("createMemorySecureStore", () => {
  it("stores, replaces and deletes one secret", async () => {
    const store = createMemorySecureStore();
    await expect(store.get()).resolves.toBeNull();
    await store.set("first");
    await store.set("rotated");
    await expect(store.get()).resolves.toBe("rotated");
    await store.delete();
    await expect(store.get()).resolves.toBeNull();
  });
});
