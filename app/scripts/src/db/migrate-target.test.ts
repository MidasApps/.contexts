import { describe, expect, it } from "vitest";
import { resolveMigrateTarget, UnsafeMigrateTargetError } from "./migrate-target.ts";

const LOCAL = { APP_ENV: "local", DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app" };
const STAGING = { APP_ENV: "staging", DATABASE_URL: "postgresql://svc@/app?host=/cloudsql/acme:southamerica-east1:db" };

describe("resolveMigrateTarget", () => {
  it("migrates the local container without confirmation", () => {
    expect(resolveMigrateTarget(LOCAL, [])).toEqual({ appEnv: "local", databaseUrl: LOCAL.DATABASE_URL });
  });

  it("refuses a local env whose database is not on this machine", () => {
    const run = () => resolveMigrateTarget({ ...LOCAL, DATABASE_URL: "postgresql://app@db.example.com/app" }, []);

    expect(run).toThrow(UnsafeMigrateTargetError);
    expect(run).toThrow(/DATABASE_URL/);
  });

  it("refuses a remote env unless --confirm-env names it", () => {
    expect(() => resolveMigrateTarget(STAGING, [])).toThrow(/--confirm-env staging/);
    expect(() => resolveMigrateTarget(STAGING, ["--confirm-env", "prod"])).toThrow(UnsafeMigrateTargetError);
    expect(resolveMigrateTarget(STAGING, ["--confirm-env", "staging"])).toEqual({
      appEnv: "staging",
      databaseUrl: STAGING.DATABASE_URL,
    });
  });

  it("names missing or invalid variables, never their values", () => {
    const run = () => resolveMigrateTarget({ APP_ENV: "qa", DATABASE_URL: "mysql://root:s3cr3t@x/app" }, []);

    expect(run).toThrow(/APP_ENV, DATABASE_URL/);
    expect(run).not.toThrow(/s3cr3t/);
  });
});
