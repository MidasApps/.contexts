import { describe, expect, it } from "vitest";
import { loadDesktopEnv } from "@/config/desktop-env.schema.ts";
import { toClientConfig } from "./desktop-client-config.ts";

const LOCAL_ENV = loadDesktopEnv({
  VITE_API_URL: "http://localhost:3100",
  VITE_APP_ENV: "local",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-core.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-core",
  VITE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_MFA_FACTORS: "phone",
});

describe("toClientConfig", () => {
  it("maps the local desktop env to the shared client config, API on its own origin", () => {
    expect(toClientConfig(LOCAL_ENV)).toEqual({
      appEnv: "local",
      apiBaseUrl: "http://localhost:3100",
      firebase: { apiKey: "demo-api-key", authDomain: "demo-core.firebaseapp.com", projectId: "demo-core" },
      authEmulatorUrl: "http://127.0.0.1:9099",
      mfaFactors: ["phone"],
    });
  });

  it("leaves the emulator out of a remote config (the client schema forbids it there)", () => {
    const config = toClientConfig({
      ...LOCAL_ENV,
      VITE_API_URL: "https://api.example.com",
      VITE_APP_ENV: "prod",
      VITE_AUTH_EMULATOR_URL: undefined,
      VITE_MFA_FACTORS: ["totp"],
    });

    expect(config).not.toHaveProperty("authEmulatorUrl");
    expect(config).toMatchObject({ appEnv: "prod", apiBaseUrl: "https://api.example.com", mfaFactors: ["totp"] });
  });
});
