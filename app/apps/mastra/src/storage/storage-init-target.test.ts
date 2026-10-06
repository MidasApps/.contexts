import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { assertStorageInitConfirmed, loadStorageInitEnv, UnconfirmedStorageInitError } from "./storage-init-target.ts";

const PROD_SOURCE = {
  APP_ENV: "prod",
  FIREBASE_PROJECT_ID: "acme-prod",
  DATABASE_URL: "postgresql://svc@/app?host=/cloudsql/acme-prod:southamerica-east1:core-db",
};

describe("loadStorageInitEnv", () => {
  it("needs no AI provider key or MCP state key, even with AI_MODE=real", () => {
    const env = loadStorageInitEnv({ ...PROD_SOURCE, AI_MODE: "real" });
    expect(env).toMatchObject({ APP_ENV: "prod", DATABASE_URL: PROD_SOURCE.DATABASE_URL });
  });

  it("still enforces the database rules of the services env", () => {
    expect(() => loadStorageInitEnv({ ...PROD_SOURCE, DATABASE_URL: "postgresql://svc@/app?host=/tmp/x" })).toThrow(
      InvalidEnvError,
    );
  });
});

describe("assertStorageInitConfirmed", () => {
  it("lets local init without a flag", () => {
    expect(() => assertStorageInitConfirmed("local", [])).not.toThrow();
  });

  it("requires --confirm-env naming the remote env", () => {
    expect(() => assertStorageInitConfirmed("prod", [])).toThrow(UnconfirmedStorageInitError);
    expect(() => assertStorageInitConfirmed("prod", ["--confirm-env", "staging"])).toThrow(/--confirm-env prod/);
    expect(() => assertStorageInitConfirmed("prod", ["--confirm-env", "prod"])).not.toThrow();
  });
});
