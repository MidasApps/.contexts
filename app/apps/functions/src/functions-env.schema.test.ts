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

  it("ignores variables the Functions runtime injects", () => {
    expect(loadFunctionsEnv({ APP_ENV: "local", GCLOUD_PROJECT: "demo-core", K_SERVICE: "healthz" })).toEqual({
      APP_ENV: "local",
    });
  });
});
