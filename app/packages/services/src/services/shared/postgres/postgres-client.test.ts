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
});
