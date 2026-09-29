import { describe, expect, it } from "vitest";
import { InvalidEnvError } from "./invalid-env-error.ts";
import { loadServicesEnv, ServicesEnvSchema } from "./services-env.schema.ts";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  PUBSUB_EMULATOR_HOST: "127.0.0.1:8085",
};

const REMOTE_ENV = {
  APP_ENV: "staging",
  FIREBASE_PROJECT_ID: "acme-staging",
  DATABASE_URL: "postgresql://svc@10.0.0.5:5432/app",
};

const issuePaths = (source: Record<string, string | undefined>) => {
  const result = ServicesEnvSchema.safeParse(source);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("ServicesEnvSchema", () => {
  it("accepts a local env on the demo project and emulators, defaulting AI_MODE to real", () => {
    expect(loadServicesEnv(LOCAL_ENV)).toMatchObject({ APP_ENV: "local", AI_MODE: "real" });
  });

  it("accepts a remote env without emulator hosts", () => {
    expect(loadServicesEnv({ ...REMOTE_ENV, AI_MODE: "fake" }).AI_MODE).toBe("fake");
  });

  it("rejects a local env that points at a non-demo Firebase project", () => {
    expect(issuePaths({ ...LOCAL_ENV, FIREBASE_PROJECT_ID: "acme-prod" })).toEqual([
      "FIREBASE_PROJECT_ID",
    ]);
  });

  it("rejects a local env without the Auth and Firestore emulators", () => {
    const source = { ...LOCAL_ENV, FIREBASE_AUTH_EMULATOR_HOST: undefined, FIRESTORE_EMULATOR_HOST: undefined };
    expect(issuePaths(source)).toEqual(["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]);
  });

  it("rejects a local env whose database is not on this machine", () => {
    expect(issuePaths({ ...LOCAL_ENV, DATABASE_URL: "postgresql://app@db.example.com/app" })).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("rejects emulator hosts and demo projects outside local", () => {
    const source = { ...REMOTE_ENV, FIREBASE_PROJECT_ID: "demo-core", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
    expect(issuePaths(source)).toEqual(["FIREBASE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST"]);
  });

  it("rejects a non-postgres DATABASE_URL and an unknown AI_MODE", () => {
    const source = { ...REMOTE_ENV, DATABASE_URL: "mysql://x@10.0.0.5/app", AI_MODE: "mock" };
    expect(issuePaths(source)).toEqual(["DATABASE_URL", "AI_MODE"]);
  });

  it("throws INVALID_ENV at boot naming the fields but not their values", () => {
    const secretUrl = "mysql://user:s3cr3t@10.0.0.5/app";
    const load = () => loadServicesEnv({ ...REMOTE_ENV, DATABASE_URL: secretUrl });
    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).not.toThrow(/s3cr3t/);
  });
});
