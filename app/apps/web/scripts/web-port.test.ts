import { describe, expect, it } from "vitest";
import { DEFAULT_WEB_PORT, resolveWebPort } from "./web-port.ts";

describe("resolveWebPort", () => {
  it("defaults to 3000 when WEB_PORT is unset or empty", () => {
    expect(resolveWebPort({})).toBe(DEFAULT_WEB_PORT);
    expect(resolveWebPort({ WEB_PORT: "" })).toBe(3000);
  });

  it("reads WEB_PORT as a port number", () => {
    expect(resolveWebPort({ WEB_PORT: "3100" })).toBe(3100);
  });

  it.each(["0", "65536", "30a", "3000.5", "-1"])("rejects WEB_PORT=%s naming the variable", (value) => {
    expect(() => resolveWebPort({ WEB_PORT: value })).toThrow(/WEB_PORT/);
  });

  it("ignores PORT, which the Mastra server reads", () => {
    expect(resolveWebPort({ PORT: "4111" })).toBe(3000);
  });
});
