import { describe, expect, it } from "vitest";
import { loadMastraEnv, type MastraEnv } from "../mastra-env.schema.ts";
import { buildLoggerOptions, buildServerConfig, buildStorageConfig, createTimestampMixin } from "./mastra-options.ts";

const LOCAL_SOURCE = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  AI_MODE: "fake",
};
const PROD_SOURCE = {
  APP_ENV: "prod",
  FIREBASE_PROJECT_ID: "acme-prod",
  DATABASE_URL: "postgresql://svc@10.0.0.5:5432/app",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-test-key",
  MCP_REQUEST_STATE_KEY: "k".repeat(32),
  MASTRA_HOST: "0.0.0.0",
  PORT: "8081",
};

const localEnv: MastraEnv = loadMastraEnv(LOCAL_SOURCE);
const prodEnv: MastraEnv = loadMastraEnv(PROD_SOURCE);

describe("buildStorageConfig", () => {
  it("keeps Mastra's tables in the dedicated mastra schema", () => {
    expect(buildStorageConfig(localEnv)).toEqual({
      id: "mastra-storage",
      connectionString: "postgresql://app:app@127.0.0.1:5432/app",
      schemaName: "mastra",
    });
  });
});

describe("buildServerConfig", () => {
  it("binds host and port from the env and lets streams outlive the 180 s default", () => {
    expect(buildServerConfig(prodEnv)).toMatchObject({ host: "0.0.0.0", port: 8081, timeout: 900_000 });
  });

  it("turns CORS off outside local, where only the /v1 API calls Mastra", () => {
    expect(buildServerConfig(prodEnv).cors).toBe(false);
  });

  it("allows only Studio and the configured dev origins in local, never *", () => {
    expect(buildServerConfig(localEnv).cors).toEqual({
      origin: [
        "http://localhost:4111",
        "http://localhost:3000",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
      ],
      credentials: false,
    });
  });

  it("keeps Swagger, OpenAPI docs and raw request logs off in builds", () => {
    expect(buildServerConfig(prodEnv).build).toEqual({ swaggerUI: false, openAPIDocs: false, apiReqLogs: false });
  });
});

describe("buildLoggerOptions", () => {
  const options = buildLoggerOptions(prodEnv, () => new Date("2026-09-29T12:00:00.000Z"));

  it("writes single-line JSON with a message key at the configured level", () => {
    expect(options).toMatchObject({ name: "mastra", level: "info", prettyPrint: false, messageKey: "message" });
  });

  it("labels levels and replaces pid/hostname with service and env", () => {
    expect(options.formatters?.level?.("warn", 40)).toEqual({ level: "warn" });
    expect(options.formatters?.bindings?.({ pid: 1, hostname: "h" })).toEqual({ service: "mastra", env: "prod" });
  });

  it("stamps every record with an ISO timestamp", () => {
    const mixin = createTimestampMixin(() => new Date("2026-09-29T12:00:00.000Z"));

    expect(mixin()).toEqual({ timestamp: "2026-09-29T12:00:00.000Z" });
  });
});
