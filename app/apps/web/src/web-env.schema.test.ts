import { InvalidEnvError } from "@core/services";
import { describe, expect, it } from "vitest";
import { loadWebEnv } from "./web-env.schema";

const LOCAL_ENV = {
  APP_ENV: "local",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
};

const REMOTE_ENV = {
  APP_ENV: "staging",
  FIREBASE_PROJECT_ID: "core-staging",
  DATABASE_URL: "postgresql://app@10.0.0.5:5432/app",
  NEXT_PUBLIC_APP_URL: "https://staging.example.com",
  NEXT_PUBLIC_APP_ENV: "staging",
  MASTRA_URL: "https://mastra-staging.a.run.app",
  MASTRA_AUDIENCE: "https://mastra-staging.a.run.app",
  FILES_BUCKET: "core-staging-files",
};

describe("loadWebEnv", () => {
  it("composes the services env with the web-only variables", () => {
    expect(loadWebEnv(LOCAL_ENV)).toMatchObject({
      APP_ENV: "local",
      AI_MODE: "real",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("names every invalid variable of both schemas, never its value", () => {
    const load = () => loadWebEnv({ ...LOCAL_ENV, DATABASE_URL: "mysql://secret@db", NEXT_PUBLIC_APP_URL: "nope" });

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/DATABASE_URL.*NEXT_PUBLIC_APP_URL/);
    expect(load).not.toThrow(/secret/);
  });

  it("defaults the CORS allowlist in local to the desktop dev server and the Tauri webview origins", () => {
    expect(loadWebEnv(LOCAL_ENV).CORS_ALLOWED_ORIGINS).toEqual([
      "http://localhost:1420",
      "tauri://localhost",
      "http://tauri.localhost",
    ]);
  });

  it("requires an explicit CORS allowlist outside local", () => {
    const load = () => loadWebEnv(REMOTE_ENV);

    expect(load).toThrow(InvalidEnvError);
    expect(load).toThrow(/CORS_ALLOWED_ORIGINS \(REQUIRED\)/);
  });

  it("accepts an empty allowlist outside local (CORS off)", () => {
    expect(loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "" }).CORS_ALLOWED_ORIGINS).toEqual([]);
  });

  it("rejects a wildcard origin", () => {
    expect(() => loadWebEnv({ ...LOCAL_ENV, CORS_ALLOWED_ORIGINS: "*" })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it("defaults MASTRA_URL to the local mastra dev server and needs no audience in local", () => {
    const env = loadWebEnv(LOCAL_ENV);
    expect(env.MASTRA_URL).toBe("http://localhost:4111");
    expect(env.MASTRA_AUDIENCE).toBeUndefined();
  });

  it("requires MASTRA_URL (https) and MASTRA_AUDIENCE outside local, reporting every issue at once", () => {
    const withoutMastra = { ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "", MASTRA_URL: undefined, MASTRA_AUDIENCE: undefined };
    expect(() => loadWebEnv(withoutMastra)).toThrow(/MASTRA_URL \(REQUIRED\).*MASTRA_AUDIENCE \(REQUIRED\)/);
    expect(() => loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "", MASTRA_URL: "http://mastra.internal" })).toThrow(/MASTRA_URL \(HTTPS_REQUIRED\)/);
    expect(loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "" }).MASTRA_URL).toBe("https://mastra-staging.a.run.app");
  });

  it("defaults FILES_BUCKET to the demo project's default bucket in local and requires it outside local", () => {
    expect(loadWebEnv(LOCAL_ENV).FILES_BUCKET).toBe("demo-core.appspot.com");
    expect(() => loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "", FILES_BUCKET: undefined })).toThrow(/FILES_BUCKET \(REQUIRED\)/);
    expect(loadWebEnv({ ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "" }).FILES_BUCKET).toBe("core-staging-files");
  });
});

describe("loadWebEnv public client variables", () => {
  it("requires NEXT_PUBLIC_APP_ENV and that it equals APP_ENV (the client bundle must name the same environment)", () => {
    expect(() => loadWebEnv({ ...LOCAL_ENV, NEXT_PUBLIC_APP_ENV: undefined })).toThrow(/NEXT_PUBLIC_APP_ENV \(REQUIRED\)/);
    expect(() => loadWebEnv({ ...LOCAL_ENV, NEXT_PUBLIC_APP_ENV: "prod" })).toThrow(/NEXT_PUBLIC_APP_ENV \(MISMATCH\)/);
  });

  it("parses NEXT_PUBLIC_MFA_FACTORS as a list of known factors", () => {
    expect(loadWebEnv({ ...LOCAL_ENV, NEXT_PUBLIC_MFA_FACTORS: "phone, totp" }).NEXT_PUBLIC_MFA_FACTORS).toEqual(["phone", "totp"]);
    expect(() => loadWebEnv({ ...LOCAL_ENV, NEXT_PUBLIC_MFA_FACTORS: "email" })).toThrow(/NEXT_PUBLIC_MFA_FACTORS/);
  });

  it("requires the Auth Emulator URL in local and refuses it elsewhere", () => {
    expect(loadWebEnv(LOCAL_ENV).NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL).toBe("http://127.0.0.1:9099");
    expect(() => loadWebEnv({ ...LOCAL_ENV, NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: undefined })).toThrow(/NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL \(REQUIRED\)/);
    const remote = { ...REMOTE_ENV, CORS_ALLOWED_ORIGINS: "", NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" };
    expect(() => loadWebEnv(remote)).toThrow(/NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL \(FORBIDDEN\)/);
  });
});
