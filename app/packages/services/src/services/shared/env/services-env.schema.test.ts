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
    expect(issuePaths({ ...LOCAL_ENV, FIREBASE_PROJECT_ID: "acme-prod" })).toEqual(["FIREBASE_PROJECT_ID"]);
  });

  it("rejects a local env without the Auth and Firestore emulators", () => {
    const source = { ...LOCAL_ENV, FIREBASE_AUTH_EMULATOR_HOST: undefined, FIRESTORE_EMULATOR_HOST: undefined };
    expect(issuePaths(source)).toEqual(["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]);
  });

  it("rejects a local env whose database is not on this machine", () => {
    expect(issuePaths({ ...LOCAL_ENV, DATABASE_URL: "postgresql://app@db.example.com/app" })).toEqual(["DATABASE_URL"]);
  });

  it("rejects emulator hosts and demo projects outside local", () => {
    const source = { ...REMOTE_ENV, FIREBASE_PROJECT_ID: "demo-core", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
    expect(issuePaths(source)).toEqual(["FIREBASE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST"]);
  });

  it("rejects the Auth emulator host in prod, where it would accept unsigned tokens (follow-up 12c)", () => {
    expect(issuePaths({ ...REMOTE_ENV, APP_ENV: "prod", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toEqual([
      "FIREBASE_AUTH_EMULATOR_HOST",
    ]);
  });

  it("reports an unparsable DATABASE_URL in local instead of crashing the refinement", () => {
    expect(issuePaths({ ...LOCAL_ENV, DATABASE_URL: "nope" })).toEqual(["DATABASE_URL"]);
  });

  it("reports a malformed percent-escape in the socket DSN as an env issue, not a URIError", () => {
    const socketUrl = "postgresql://svc%zz@/app?host=/cloudsql/acme-prod:southamerica-east1:core-db";
    expect(issuePaths({ ...REMOTE_ENV, DATABASE_URL: socketUrl })).toEqual(["DATABASE_URL"]);
    expect(() => loadServicesEnv({ ...REMOTE_ENV, DATABASE_URL: socketUrl })).toThrow(InvalidEnvError);
  });

  it("rejects a non-postgres DATABASE_URL and an unknown AI_MODE", () => {
    const source = { ...REMOTE_ENV, DATABASE_URL: "mysql://x@10.0.0.5/app", AI_MODE: "mock" };
    expect(issuePaths(source)).toEqual(["DATABASE_URL", "AI_MODE"]);
  });

  it("accepts the Cloud SQL unix socket DSN outside local", () => {
    const socketUrl = "postgresql://svc@/app?host=/cloudsql/acme-prod:southamerica-east1:core-db";
    expect(loadServicesEnv({ ...REMOTE_ENV, APP_ENV: "prod", DATABASE_URL: socketUrl }).DATABASE_URL).toBe(socketUrl);
  });

  it("rejects the socket DSN in local, which must use the Postgres container", () => {
    const socketUrl = "postgresql://app@/app?host=/cloudsql/acme-prod:southamerica-east1:core-db";
    expect(issuePaths({ ...LOCAL_ENV, DATABASE_URL: socketUrl })).toEqual(["DATABASE_URL"]);
  });

  it("rejects a socket directory outside /cloudsql or too long for a unix socket path", () => {
    const longInstance = `/cloudsql/${"p".repeat(40)}:${"r".repeat(20)}:${"i".repeat(40)}`;
    expect(issuePaths({ ...REMOTE_ENV, DATABASE_URL: "postgresql://svc@/app?host=/tmp/pg" })).toEqual(["DATABASE_URL"]);
    expect(issuePaths({ ...REMOTE_ENV, DATABASE_URL: `postgresql://svc@/app?host=${longInstance}` })).toEqual([
      "DATABASE_URL",
    ]);
  });

  it("throws INVALID_ENV at boot naming the fields but not their values", () => {
    const secretUrl = "mysql://user:s3cr3t@10.0.0.5/app";
    const load = () => loadServicesEnv({ ...REMOTE_ENV, DATABASE_URL: secretUrl });
    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).not.toThrow(/s3cr3t/);
  });

  it("defaults the SP1 session, API key, organization and MFA settings", () => {
    expect(loadServicesEnv(REMOTE_ENV)).toMatchObject({
      SESSION_MAX_AGE_DAYS: 5,
      DESKTOP_SESSION_MAX_AGE_DAYS: 30,
      API_KEY_PREFIX: "core",
      ORGANIZATION_SELF_SERVE: true,
      ORGANIZATION_DEFAULT_PROJECT: false,
      MFA_FACTORS: ["totp"],
      TRUSTED_PROXY_HOPS: 1,
    });
  });

  it("parses the SP1 settings from strings", () => {
    const source = {
      ...REMOTE_ENV,
      SESSION_MAX_AGE_DAYS: "14",
      DESKTOP_SESSION_MAX_AGE_DAYS: "90",
      API_KEY_PREFIX: "acme",
      ORGANIZATION_SELF_SERVE: "false",
      ORGANIZATION_DEFAULT_PROJECT: "true",
      MFA_FACTORS: "phone, totp,phone",
      TRUSTED_PROXY_HOPS: "2",
    };
    expect(loadServicesEnv(source)).toMatchObject({
      SESSION_MAX_AGE_DAYS: 14,
      DESKTOP_SESSION_MAX_AGE_DAYS: 90,
      API_KEY_PREFIX: "acme",
      ORGANIZATION_SELF_SERVE: false,
      ORGANIZATION_DEFAULT_PROJECT: true,
      MFA_FACTORS: ["phone", "totp"],
      TRUSTED_PROXY_HOPS: 2,
    });
  });

  it("rejects SP1 settings out of range", () => {
    const source = {
      ...REMOTE_ENV,
      SESSION_MAX_AGE_DAYS: "15",
      DESKTOP_SESSION_MAX_AGE_DAYS: "0",
      API_KEY_PREFIX: "Core_1",
      ORGANIZATION_SELF_SERVE: "yes",
      ORGANIZATION_DEFAULT_PROJECT: "1",
      MFA_FACTORS: "totp,email",
      TRUSTED_PROXY_HOPS: "6",
    };
    expect(issuePaths(source)).toEqual([
      "SESSION_MAX_AGE_DAYS",
      "DESKTOP_SESSION_MAX_AGE_DAYS",
      "API_KEY_PREFIX",
      "ORGANIZATION_SELF_SERVE",
      "ORGANIZATION_DEFAULT_PROJECT",
      "MFA_FACTORS.1",
      "TRUSTED_PROXY_HOPS",
    ]);
  });

  it("rejects a fractional session age and an empty MFA list", () => {
    expect(issuePaths({ ...REMOTE_ENV, SESSION_MAX_AGE_DAYS: "2.5", MFA_FACTORS: " , " })).toEqual([
      "SESSION_MAX_AGE_DAYS",
      "MFA_FACTORS",
    ]);
  });
});
