import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_CONNECT_SRC, buildTauriApiConfigPatch } from "./tauri-api-config.ts";

type TauriConf = { app: { security: { csp: Record<string, string> } } };
const TAURI_CONF = path.resolve(import.meta.dirname, "../src-tauri/tauri.conf.json");

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

  it("keeps the base release CSP closed: no API origin until the patch adds one", () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8")) as TauriConf;

    expect(conf.app.security.csp["connect-src"]).toBe(BASE_CONNECT_SRC);
  });
});
