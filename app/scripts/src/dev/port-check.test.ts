import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findBusyPorts, isPortInUse } from "./port-check.ts";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server === undefined ? resolve() : server.close(() => resolve())));
  server = undefined;
});

const listenOnFreePort = async (host: string): Promise<number> => {
  server = createServer();
  const active = server;
  await new Promise<void>((resolve) => active.listen(0, host, resolve));
  const address = active.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
};

describe("isPortInUse", () => {
  it("reports a port held by a loopback listener", async () => {
    const port = await listenOnFreePort("127.0.0.1");
    expect(await isPortInUse(port)).toBe(true);
  });

  it("reports a port held by an all-interfaces listener", async () => {
    const port = await listenOnFreePort("0.0.0.0");
    expect(await isPortInUse(port)).toBe(true);
  });

  it("reports a port nobody holds as free", async () => {
    const port = await listenOnFreePort("127.0.0.1");
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    expect(await isPortInUse(port)).toBe(false);
  });
});

describe("findBusyPorts", () => {
  it("returns the checks whose port is in use", async () => {
    const checks = [
      { name: "web", port: 3000, variable: "WEB_PORT" },
      { name: "mastra", port: 4111, variable: "PORT" },
    ];
    const busy = await findBusyPorts(checks, (port) => Promise.resolve(port === 3000));
    expect(busy).toEqual([{ name: "web", port: 3000, variable: "WEB_PORT" }]);
  });
});
