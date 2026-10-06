import { describe, expect, it } from "vitest";
import { buildPostgresConnection } from "./postgres-client.ts";

describe("buildPostgresConnection", () => {
  it("passes a TCP URL to the driver with the pool size", () => {
    const connection = buildPostgresConnection({ DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app" }, { max: 3 });

    expect(connection.url).toBe("postgresql://app:app@127.0.0.1:5432/app");
    expect(connection.options).toMatchObject({ max: 3 });
  });

  it("turns the Cloud SQL socket form into host/database/user options", () => {
    const connection = buildPostgresConnection({
      DATABASE_URL: "postgresql://svc@/app?host=/cloudsql/acme-prod:southamerica-east1:core-db",
    });

    expect(connection.url).toBeUndefined();
    expect(connection.options).toMatchObject({
      host: "/cloudsql/acme-prod:southamerica-east1:core-db",
      port: 5432,
      database: "app",
      username: "svc",
    });
  });

  it("maps socket query parameters: sslmode to ssl, pool settings to options, the rest to server parameters", () => {
    const connection = buildPostgresConnection({
      DATABASE_URL:
        "postgresql://svc@/app?host=/cloudsql/a:b:c&sslmode=require&connect_timeout=5&application_name=core-api",
    });

    expect(connection.options).toMatchObject({
      ssl: "require",
      connect_timeout: 5,
      connection: { application_name: "core-api" },
    });
  });

  it("turns sslmode=disable into ssl false and lets explicit pool options win", () => {
    const connection = buildPostgresConnection(
      { DATABASE_URL: "postgresql://svc@/app?host=/cloudsql/a:b:c&sslmode=disable&connect_timeout=5" },
      { connectTimeoutSeconds: 2 },
    );

    expect(connection.options).toMatchObject({ ssl: false, connect_timeout: 2 });
  });
});
