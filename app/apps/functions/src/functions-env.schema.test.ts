import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { loadFunctionsEnv } from "./functions-env.schema.ts";

describe("loadFunctionsEnv", () => {
  it("reads the logical environment", () => {
    expect(loadFunctionsEnv({ APP_ENV: "staging" })).toEqual({ APP_ENV: "staging" });
  });

  it("fails the boot naming the variable when APP_ENV is missing", () => {
    expect(() => loadFunctionsEnv({})).toThrow(InvalidEnvError);
    expect(() => loadFunctionsEnv({})).toThrow(/APP_ENV/);
  });

  it("never echoes an invalid value", () => {
    expect(() => loadFunctionsEnv({ APP_ENV: "s3cr3t" })).toThrow(InvalidEnvError);
    expect(() => loadFunctionsEnv({ APP_ENV: "s3cr3t" })).not.toThrow(/s3cr3t/);
  });

  it("accepts emulator hosts in local", () => {
    const source = { APP_ENV: "local", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
    expect(loadFunctionsEnv(source)).toEqual({ APP_ENV: "local" });
  });

  it("rejects emulator hosts outside local, naming each one", () => {
    const source = { APP_ENV: "prod", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
    expect(() => loadFunctionsEnv(source)).toThrow(InvalidEnvError);
    expect(() => loadFunctionsEnv(source)).toThrow(/FIREBASE_AUTH_EMULATOR_HOST.*FIRESTORE_EMULATOR_HOST/);
    expect(() => loadFunctionsEnv(source)).not.toThrow(/127\.0\.0\.1/);
  });

  it("treats an empty emulator host outside local as unset", () => {
    expect(loadFunctionsEnv({ APP_ENV: "staging", FIRESTORE_EMULATOR_HOST: "" })).toEqual({ APP_ENV: "staging" });
  });

  it("keeps GCLOUD_PROJECT and ignores the other variables the Functions runtime injects", () => {
    expect(loadFunctionsEnv({ APP_ENV: "local", GCLOUD_PROJECT: "demo-core", K_SERVICE: "healthz" })).toEqual({
      APP_ENV: "local",
      GCLOUD_PROJECT: "demo-core",
    });
  });

  it("reads the Mastra URL and audience of the workflow approval trigger (decision 0036)", () => {
    expect(loadFunctionsEnv({ APP_ENV: "staging", MASTRA_URL: "https://mastra.run.app", MASTRA_AUDIENCE: "https://mastra.run.app" })).toEqual({
      APP_ENV: "staging",
      MASTRA_URL: "https://mastra.run.app",
      MASTRA_AUDIENCE: "https://mastra.run.app",
    });
    expect(loadFunctionsEnv({ APP_ENV: "local", MASTRA_URL: "http://localhost:4111" })).toEqual({ APP_ENV: "local", MASTRA_URL: "http://localhost:4111" });
    expect(() => loadFunctionsEnv({ APP_ENV: "prod", MASTRA_URL: "http://mastra.internal" })).toThrow(/MASTRA_URL/);
    expect(() => loadFunctionsEnv({ APP_ENV: "prod", MASTRA_URL: "not a url" })).toThrow(/MASTRA_URL/);
  });

  it("reads an optional files bucket and rejects a malformed one", () => {
    expect(loadFunctionsEnv({ APP_ENV: "staging", FILES_BUCKET: "core-files-staging" })).toEqual({ APP_ENV: "staging", FILES_BUCKET: "core-files-staging" });
    expect(() => loadFunctionsEnv({ APP_ENV: "staging", FILES_BUCKET: "Bad Bucket" })).toThrow(/FILES_BUCKET/);
  });
});
