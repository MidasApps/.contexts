import { describe, expect, it } from "vitest";
import { parseDatabaseUrl, socketFilePath } from "./database-url.ts";

const INSTANCE = "/cloudsql/acme-prod:southamerica-east1:core-db";

describe("parseDatabaseUrl", () => {
  it("reads a TCP URL as is", () => {
    expect(parseDatabaseUrl("postgresql://app:app@127.0.0.1:5432/app")).toEqual({
      kind: "tcp",
      url: "postgresql://app:app@127.0.0.1:5432/app",
      hostname: "127.0.0.1",
    });
  });

  it("reads the Cloud SQL socket form, which WHATWG URL cannot parse", () => {
    expect(parseDatabaseUrl(`postgresql://svc@/app?host=${INSTANCE}`)).toEqual({
      kind: "socket",
      socketDir: INSTANCE,
      database: "app",
      username: "svc",
      port: 5432,
    });
  });

  it("keeps a socket password and port and decodes percent-escapes", () => {
    expect(parseDatabaseUrl(`postgres://svc%40x:p%2Fw@/app?host=${INSTANCE}&port=6432`)).toMatchObject({
      username: "svc@x",
      password: "p/w",
      port: 6432,
    });
  });

  it.each([
    ["mysql://x@10.0.0.5/app"],
    ["nope"],
    ["postgresql://svc@/app"],
    ["postgresql://svc@/app?host=relative/dir"],
    ["postgresql:///app"],
  ])("rejects %s", (value) => {
    expect(parseDatabaseUrl(value)).toBeUndefined();
  });
});

describe("socketFilePath", () => {
  it("appends the Postgres socket file name for the port", () => {
    expect(socketFilePath({ socketDir: INSTANCE, port: 5432 })).toBe(`${INSTANCE}/.s.PGSQL.5432`);
  });
});
