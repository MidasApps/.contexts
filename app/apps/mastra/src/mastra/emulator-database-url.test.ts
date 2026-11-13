import { describe, expect, it } from "vitest";
import { emulatorDatabaseUrl, NonLocalTestDatabaseError } from "./emulator-database-url.fixture.ts";

describe("emulatorDatabaseUrl", () => {
  it("uses the compose Postgres when DATABASE_URL is not set", () => {
    expect(emulatorDatabaseUrl({})).toBe("postgresql://app:app@127.0.0.1:5432/app");
  });

  it("follows DATABASE_URL to a local Postgres on another port", () => {
    const url = "postgresql://app:app@127.0.0.1:15432/app";
    expect(emulatorDatabaseUrl({ DATABASE_URL: url })).toBe(url);
    expect(emulatorDatabaseUrl({ DATABASE_URL: "postgres://app:app@localhost:5432/app" })).toBe(
      "postgres://app:app@localhost:5432/app",
    );
  });

  it("refuses a remote host, a Cloud SQL socket and a value that is not a postgres URL", () => {
    for (const DATABASE_URL of [
      "postgresql://app:secret@10.20.0.3:5432/app",
      "postgresql://app@/app?host=/cloudsql/demo:southamerica-east1:core",
      "not a url",
    ]) {
      expect(() => emulatorDatabaseUrl({ DATABASE_URL }), DATABASE_URL).toThrow(NonLocalTestDatabaseError);
    }
  });

  it("never puts the URL in the error message", () => {
    expect(() => emulatorDatabaseUrl({ DATABASE_URL: "postgresql://app:secret@10.20.0.3:5432/app" })).toThrow(
      /^refusing to run the emulator suites: DATABASE_URL is not the local Postgres container$/,
    );
  });
});
