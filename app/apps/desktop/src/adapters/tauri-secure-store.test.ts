import { SecureStoreError } from "@core/client/shared/lib/secure-store";
import { describe, expect, it } from "vitest";
import { createTauriSecureStore, type TauriInvoke } from "./tauri-secure-store.ts";

type Call = { readonly cmd: string; readonly args: unknown };

/** Fake of Tauri's `invoke` over one in-memory slot; `reject` makes every call fail with it. */
const fakeInvoke = (options: { reject?: unknown } = {}) => {
  const calls: Call[] = [];
  let slot: string | null = null;
  const invoke: TauriInvoke = (cmd, args) => {
    calls.push({ cmd, args });
    // Tauri rejects with the command's serialized error (`{ code }`) or an ACL string, not an Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- see above
    if (options.reject !== undefined) return Promise.reject(options.reject);
    if (cmd === "secure_store_get") return Promise.resolve(slot);
    if (cmd === "secure_store_set") slot = (args as { secret: string }).secret;
    if (cmd === "secure_store_delete") slot = null;
    return Promise.resolve(null);
  };
  return { invoke, calls };
};

describe("createTauriSecureStore", () => {
  it("stores, reads and deletes through the three secure store commands", async () => {
    const { invoke, calls } = fakeInvoke();
    const store = createTauriSecureStore({ invoke });

    await expect(store.get()).resolves.toBeNull();
    await store.set("record");
    await expect(store.get()).resolves.toBe("record");
    await store.delete();
    await expect(store.get()).resolves.toBeNull();

    expect(calls.map((call) => call.cmd)).toEqual([
      "secure_store_get",
      "secure_store_set",
      "secure_store_get",
      "secure_store_delete",
      "secure_store_get",
    ]);
    expect(calls[1]?.args).toEqual({ secret: "record" });
  });

  it("maps the native unavailable code to SECURE_STORE_UNAVAILABLE", async () => {
    const store = createTauriSecureStore(fakeInvoke({ reject: { code: "SECURE_STORE_UNAVAILABLE" } }));

    await expect(store.get()).rejects.toMatchObject({ name: "SecureStoreError", code: "SECURE_STORE_UNAVAILABLE" });
  });

  it("maps every other rejection (invalid argument, missing permission, unknown) to SECURE_STORE_FAILED", async () => {
    for (const reject of [
      { code: "SECURE_STORE_INVALID_ARGUMENT" },
      "secure_store_set not allowed by ACL",
      new Error("boom"),
    ]) {
      const store = createTauriSecureStore(fakeInvoke({ reject }));
      const error: unknown = await store.set("record").catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(SecureStoreError);
      expect(error).toMatchObject({ code: "SECURE_STORE_FAILED" });
      expect(String((error as Error).message)).not.toContain("record");
    }
  });

  it("refuses a non-string answer of secure_store_get", async () => {
    const invoke: TauriInvoke = () => Promise.resolve(42);

    await expect(createTauriSecureStore({ invoke }).get()).rejects.toMatchObject({ code: "SECURE_STORE_FAILED" });
  });
});
