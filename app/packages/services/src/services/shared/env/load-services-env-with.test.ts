import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidEnvError } from "./invalid-env-error.ts";
import { loadServicesEnvWith } from "./load-services-env-with.ts";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
};

const AppOnlySchema = z.object({
  APP_PORT: z.coerce.number().int().positive().default(4111),
  APP_URL: z.url(),
});

describe("loadServicesEnvWith", () => {
  it("merges the services env with the app-only variables and their defaults", () => {
    const env = loadServicesEnvWith(AppOnlySchema, { ...LOCAL_ENV, APP_URL: "http://localhost:4111" });

    expect(env).toMatchObject({ APP_ENV: "local", AI_MODE: "real", APP_PORT: 4111, APP_URL: "http://localhost:4111" });
  });

  it("reports the invalid variables of both schemas at once", () => {
    const load = () => loadServicesEnvWith(AppOnlySchema, { ...LOCAL_ENV, DATABASE_URL: "nope", APP_URL: "nope" });

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL.*APP_URL/);
  });

  it("reports app-only issues when the services env is valid, never the values", () => {
    const load = () => loadServicesEnvWith(AppOnlySchema, { ...LOCAL_ENV, APP_URL: "s3cr3t" });

    expect(load).toThrow(/APP_URL \(INVALID_FORMAT\)/);
    expect(load).not.toThrow(/s3cr3t/);
  });
});
