import { describe, expect, it } from "vitest";
import { resolveE2eDatabaseTarget, UnsafeE2eDatabaseError } from "./e2e-database.ts";

describe("resolveE2eDatabaseTarget", () => {
  it("names the scratch database and the maintenance database beside it", () => {
    expect(resolveE2eDatabaseTarget("postgresql://app:app@127.0.0.1:5432/app_e2e")).toEqual({
      name: "app_e2e",
      maintenanceUrl: "postgresql://app:app@127.0.0.1:5432/postgres",
    });
  });

  it("refuses a remote host", () => {
    expect(() => resolveE2eDatabaseTarget("postgresql://app:app@db.example.test:5432/app_e2e")).toThrow(UnsafeE2eDatabaseError);
  });

  it("refuses a name that would need quoting and the maintenance database itself", () => {
    expect(() => resolveE2eDatabaseTarget('postgresql://app:app@127.0.0.1:5432/a";drop')).toThrow(UnsafeE2eDatabaseError);
    expect(() => resolveE2eDatabaseTarget("postgresql://app:app@127.0.0.1:5432/postgres")).toThrow(UnsafeE2eDatabaseError);
  });

  it("refuses something that is not a postgres URL", () => {
    expect(() => resolveE2eDatabaseTarget("mysql://127.0.0.1/app_e2e")).toThrow(/not a postgres URL/);
  });
});
