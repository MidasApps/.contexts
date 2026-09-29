import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { loadWebEnv } from "./web-env.schema";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("loadWebEnv", () => {
  it("composes the services env with the web-only variables", () => {
    expect(loadWebEnv(LOCAL_ENV)).toMatchObject({
      APP_ENV: "local",
      AI_MODE: "real",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("names every invalid variable of both schemas, never its value", () => {
    const load = () => loadWebEnv({ ...LOCAL_ENV, DATABASE_URL: "mysql://secret@db", NEXT_PUBLIC_APP_URL: "nope" });

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL.*NEXT_PUBLIC_APP_URL/);
    expect(load).not.toThrow(/secret/);
  });
});
