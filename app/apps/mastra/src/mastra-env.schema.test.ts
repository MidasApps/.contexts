import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { loadMastraEnv } from "./mastra-env.schema.ts";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  AI_MODE: "fake",
};

const PROD_ENV = {
  APP_ENV: "prod",
  FIREBASE_PROJECT_ID: "acme-prod",
  DATABASE_URL: "postgresql://svc@10.0.0.5:5432/app",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-test-key",
  MCP_REQUEST_STATE_KEY: "k".repeat(32),
};

describe("loadMastraEnv", () => {
  it("defaults to Mastra's local dev server: localhost:4111, info logs, 15 min timeout", () => {
    expect(loadMastraEnv(LOCAL_ENV)).toMatchObject({
      APP_ENV: "local",
      AI_MODE: "fake",
      MASTRA_HOST: "localhost",
      PORT: 4111,
      LOG_LEVEL: "info",
      MASTRA_SERVER_TIMEOUT_MS: 900_000,
      MASTRA_CORS_ORIGINS: ["http://localhost:3000", "http://localhost:1420", "tauri://localhost", "http://tauri.localhost"],
    });
  });

  it("reads the container settings Cloud Run injects", () => {
    const env = loadMastraEnv({ ...LOCAL_ENV, MASTRA_HOST: "0.0.0.0", PORT: "8081", LOG_LEVEL: "warn" });

    expect(env).toMatchObject({ MASTRA_HOST: "0.0.0.0", PORT: 8081, LOG_LEVEL: "warn" });
  });

  it("rejects a timeout above Cloud Run's one-hour request ceiling", () => {
    expect(() => loadMastraEnv({ ...LOCAL_ENV, MASTRA_SERVER_TIMEOUT_MS: "3600001" })).toThrow(
      /MASTRA_SERVER_TIMEOUT_MS \(TOO_BIG\)/,
    );
  });

  it("parses MASTRA_CORS_ORIGINS as a comma-separated list of origins", () => {
    expect(loadMastraEnv({ ...LOCAL_ENV, MASTRA_CORS_ORIGINS: "http://localhost:3000, http://localhost:5173" }).MASTRA_CORS_ORIGINS).toEqual([
      "http://localhost:3000",
      "http://localhost:5173",
    ]);
    expect(() => loadMastraEnv({ ...LOCAL_ENV, MASTRA_CORS_ORIGINS: "*" })).toThrow(/MASTRA_CORS_ORIGINS/);
  });

  it("names every invalid variable of the services and Mastra schemas, never its value", () => {
    const load = () => loadMastraEnv({ ...LOCAL_ENV, DATABASE_URL: "mysql://s3cr3t@db", PORT: "0", LOG_LEVEL: "trace" });

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL.*PORT.*LOG_LEVEL/);
    expect(load).not.toThrow(/s3cr3t/);
  });

  it("composes the agent env: model roles and local storage init", () => {
    expect(loadMastraEnv(LOCAL_ENV)).toMatchObject({
      AI_MODEL_CHAT: "google/gemini-3.5-flash",
      AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
      MASTRA_STORAGE_INIT: "auto",
    });
  });

  it("refuses AI_MODE=fake in prod", () => {
    expect(() => loadMastraEnv({ ...PROD_ENV, AI_MODE: "fake" })).toThrow(/AI_MODE \(FAKE_ONLY_IN_LOCAL_OR_DEV\)/);
  });

  it("requires the text-role provider key in real mode and skips storage init remotely", () => {
    expect(() => loadMastraEnv({ ...PROD_ENV, GOOGLE_GENERATIVE_AI_API_KEY: "" })).toThrow(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
    expect(loadMastraEnv(PROD_ENV)).toMatchObject({ AI_MODE: "real", MASTRA_STORAGE_INIT: "skip" });
  });
});
