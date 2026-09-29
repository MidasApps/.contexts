import { describe, expect, it } from "vitest";
import { InvalidDesktopEnvError, loadDesktopEnv } from "./desktop-env.schema.ts";

describe("loadDesktopEnv", () => {
  it("accepts a local http API origin", () => {
    expect(loadDesktopEnv({ VITE_API_URL: "http://localhost:3000" })).toEqual({ VITE_API_URL: "http://localhost:3000" });
  });

  it("drops a trailing slash so paths can be appended", () => {
    expect(loadDesktopEnv({ VITE_API_URL: "https://api.example.com/" }).VITE_API_URL).toBe("https://api.example.com");
  });

  it.each([
    ["missing", undefined],
    ["not a URL", "localhost:3000"],
    ["a non-http scheme", "ftp://api.example.com"],
    ["plain http to a remote host", "http://api.example.com"],
    ["a path", "https://api.example.com/v1"],
  ])("rejects %s, naming the variable but never its value", (_label, value) => {
    const load = () => loadDesktopEnv({ VITE_API_URL: value });

    expect(load).toThrow(InvalidDesktopEnvError);
    expect(load).toThrow(/VITE_API_URL/);
    if (value) expect(load).not.toThrow(value);
  });

  it("ignores other variables (Vite adds MODE, DEV, PROD, BASE_URL)", () => {
    expect(loadDesktopEnv({ VITE_API_URL: "http://127.0.0.1:3000", MODE: "development", DEV: true })).toEqual({
      VITE_API_URL: "http://127.0.0.1:3000",
    });
  });
});
