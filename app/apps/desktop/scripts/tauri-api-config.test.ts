import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_CONNECT_SRC, buildTauriApiConfigPatch, FIREBASE_AUTH_ORIGINS } from "./tauri-api-config.ts";

type TauriConf = { app: { security: { csp: Record<string, string>; dangerousDisableAssetCspModification?: unknown } } };
const TAURI_CONF = path.resolve(import.meta.dirname, "../src-tauri/tauri.conf.json");
const FIREBASE = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://storage.googleapis.com";

describe("buildTauriApiConfigPatch", () => {
  it("allows the webview to connect only to itself, Tauri IPC, the API origin, Firebase Auth and the upload origin", () => {
    expect(buildTauriApiConfigPatch({ apiUrl: "https://api.example.com" }).app.security.csp).toEqual({
      "connect-src": `'self' ipc: http://ipc.localhost https://api.example.com ${FIREBASE}`,
    });
  });

  it("adds only the Vite HMR socket to the dev CSP", () => {
    expect(buildTauriApiConfigPatch({ apiUrl: "http://localhost:3100" }).app.security.devCsp).toEqual({
      "connect-src": `'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:3100 ${FIREBASE}`,
    });
  });

  it("adds the Auth Emulator origin when the env declares one (local only, enforced by the env schema)", () => {
    const patch = buildTauriApiConfigPatch({ apiUrl: "http://localhost:3100", authEmulatorUrl: "http://127.0.0.1:9099" });

    expect(patch.app.security.devCsp["connect-src"]).toBe(`'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:3100 ${FIREBASE} http://127.0.0.1:9099`);
    expect(patch.app.security.csp["connect-src"]).toBe(`'self' ipc: http://ipc.localhost http://localhost:3100 ${FIREBASE} http://127.0.0.1:9099`);
  });

  it("adds the Storage Emulator origin for local uploads when the env declares one", () => {
    const patch = buildTauriApiConfigPatch({ apiUrl: "http://localhost:3100", authEmulatorUrl: "http://127.0.0.1:9099", storageEmulatorUrl: "http://127.0.0.1:9199/" });

    expect(patch.app.security.csp["connect-src"]).toBe(`'self' ipc: http://ipc.localhost http://localhost:3100 ${FIREBASE} http://127.0.0.1:9099 http://127.0.0.1:9199`);
    expect(patch.app.security.devCsp["connect-src"]).toBe(`'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:3100 ${FIREBASE} http://127.0.0.1:9099 http://127.0.0.1:9199`);
  });

  it("opens no emulator origin for a remote build", () => {
    expect(buildTauriApiConfigPatch({ apiUrl: "https://api.example.com" }).app.security.csp["connect-src"]).not.toMatch(/127\.0\.0\.1|:9\d{3}/);
  });

  it("uses origins only, so a base path never widens or breaks the directive", () => {
    const patch = buildTauriApiConfigPatch({ apiUrl: "http://localhost:3100/", authEmulatorUrl: "http://127.0.0.1:9099/" });

    expect(patch.app.security.csp["connect-src"]).toBe(`'self' ipc: http://ipc.localhost http://localhost:3100 ${FIREBASE} http://127.0.0.1:9099`);
  });

  it("lists exactly the two Firebase Auth REST origins the JS SDK calls (decision 0017 §3)", () => {
    expect(FIREBASE_AUTH_ORIGINS).toEqual(["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]);
  });

  it("keeps the base release CSP closed: no API origin until the patch adds one", () => {
    const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8")) as TauriConf;

    expect(conf.app.security.csp["connect-src"]).toBe(BASE_CONNECT_SRC);
  });

  it("keeps scripts strict and opens inline styles only (sonner, next-themes, Radix scroll lock inject <style>; decision 0017)", () => {
    const { security } = (JSON.parse(readFileSync(TAURI_CONF, "utf8")) as TauriConf).app;

    expect(security.csp["script-src"]).toBe("'self'");
    expect(security.csp["style-src"]).toBe("'self' 'unsafe-inline'");
    // Tauri's injected nonces would make browsers ignore 'unsafe-inline': disabled for styles only.
    expect(security.dangerousDisableAssetCspModification).toEqual(["style-src"]);
  });
});
