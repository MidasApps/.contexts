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

const REMOTE_ENV = {
  APP_ENV: "staging",
  FIREBASE_PROJECT_ID: "core-staging",
  DATABASE_URL: "postgresql://app@10.0.0.5:5432/app",
  NEXT_PUBLIC_APP_URL: "https://staging.example.com",
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

  it("defaults the CORS allowlist in local to the desktop dev server and the Tauri webview origins", () => {
    expect(loadWebEnv(LOCAL_ENV).CORS_ALLOWED_ORIGINS).toEqual([
      "http://localhost:1420",
      "tauri://localhost",
      "http://tauri.localhost",
    ]);
  });

  it("requires an explicit CORS allowlist outside local", () => {
    const load = () => loadWebEnv(REMOTE_ENV);

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/CORS_ALLOWED_ORIGINS \(REQUIRED\)/);
  });

  it("accepts an empty allowlist outside local (CORS off)", () => {
    expect(loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "" }).CORS_ALLOWED_ORIGINS).toEqual([]);
  });

  it("rejects a wildcard origin", () => {
    expect(() => loadWebEnv({ ...LOCAL_ENV, CORS_ALLOWED_ORIGINS: "*" })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });
});

