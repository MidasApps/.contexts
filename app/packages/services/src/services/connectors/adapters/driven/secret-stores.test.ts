import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { LocalSecretStoreOutsideLocalError } from "../../domain/connector-errors.ts";
import { createLocalSecretStore } from "./local-secret-store.ts";
import { createSecretManagerStore, type SecretManagerClientLike } from "./secret-manager-store.ts";

const firestore = {} as Firestore;

const grpcError = (code: number) => Object.assign(new Error(`grpc ${code}`), { code });

const fakeClient = () => {
  const secrets = new Map<string, string[]>();
  const calls: string[] = [];
  const client: SecretManagerClientLike = {
    createSecret: ({ parent, secretId }) => {
      calls.push(`create ${parent}/${secretId}`);
      const name = `${parent}/secrets/${secretId}`;
      if (secrets.has(name)) return Promise.reject(grpcError(6));
      secrets.set(name, []);
      return Promise.resolve([{}]);
    },
    addSecretVersion: ({ parent, payload }) => {
      secrets.get(parent)?.push(payload.data.toString("utf8"));
      return Promise.resolve([{}]);
    },
    accessSecretVersion: ({ name }) => {
      const versions = secrets.get(name.replace(/\/versions\/latest$/, ""));
      if (versions === undefined || versions.length === 0) return Promise.reject(grpcError(5));
      return Promise.resolve([{ payload: { data: new TextEncoder().encode(versions.at(-1)) } }]);
    },
    deleteSecret: ({ name }) => (secrets.delete(name) ? Promise.resolve([{}]) : Promise.reject(grpcError(5))),
  };
  return { client, secrets, calls };
};

describe("local secret store", () => {
  it("is refused outside local", () => {
    for (const appEnv of ["dev", "staging", "prod"]) expect(() => createLocalSecretStore({ firestore, appEnv })).toThrow(LocalSecretStoreOutsideLocalError);
    expect(() => createLocalSecretStore({ firestore, appEnv: "local" })).not.toThrow();
  });
});

describe("secret manager store", () => {
  it("creates the secret once, adds versions and reads the latest", async () => {
    const { client, calls } = fakeClient();
    const store = createSecretManagerStore({ client, projectId: "demo-core" });
    await store.put("connector-t-c", "first");
    await store.put("connector-t-c", "second");
    expect(await store.get("connector-t-c")).toBe("second");
    expect(calls).toEqual(["create projects/demo-core/connector-t-c", "create projects/demo-core/connector-t-c"]);
  });

  it("answers null for a missing secret and ignores deleting one", async () => {
    const store = createSecretManagerStore({ client: fakeClient().client, projectId: "demo-core" });
    expect(await store.get("connector-missing")).toBeNull();
    await expect(store.delete("connector-missing")).resolves.toBeUndefined();
  });

  it("propagates other failures without the secret value", async () => {
    const client = { ...fakeClient().client, addSecretVersion: () => Promise.reject(grpcError(7)) };
    const store = createSecretManagerStore({ client, projectId: "demo-core" });
    const failure = await store.put("connector-t-c", "tok_value_123").catch((error: unknown) => error);
    expect(String(failure)).not.toContain("tok_value_123");
  });
});
