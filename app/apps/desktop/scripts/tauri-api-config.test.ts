import { describe, expect, it } from "vitest";
import { buildTauriApiConfigPatch } from "./tauri-api-config.ts";

describe("buildTauriApiConfigPatch", () => {
  it("allows the webview to connect only to itself, Tauri IPC and the API origin", () => {
    expect(buildTauriApiConfigPatch("https://api.example.com").app.security.csp).toEqual({
      "connect-src": "'self' ipc: http://ipc.localhost https://api.example.com",
    });
  });

  it("adds only the Vite HMR socket to the dev CSP", () => {
    expect(buildTauriApiConfigPatch("http://localhost:3100").app.security.devCsp).toEqual({
      "connect-src": "'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:3100",
    });
  });

  it("uses the origin only, so a base path never widens or breaks the directive", () => {
    const patch = buildTauriApiConfigPatch("http://localhost:3100/");

    expect(patch.app.security.csp["connect-src"]).toBe("'self' ipc: http://ipc.localhost http://localhost:3100");
  });
});
