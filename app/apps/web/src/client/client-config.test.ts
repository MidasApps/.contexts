import { ClientConfigError } from "@core/client/shared/config";
import { describe, expect, it } from "vitest";
import { toWebClientConfig } from "./client-config";

const LOCAL = {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-core.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-core",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  NEXT_PUBLIC_MFA_FACTORS: "phone",
};

describe("toWebClientConfig", () => {
  it("builds the shared client config for the same-origin web API", () => {
    expect(toWebClientConfig(LOCAL)).toEqual({
      appEnv: "local",
      apiBaseUrl: "",
      firebase: { apiKey: "demo-api-key", authDomain: "demo-core.firebaseapp.com", projectId: "demo-core" },
      authEmulatorUrl: "http://127.0.0.1:9099",
      mfaFactors: ["phone"],
    });
  });

  it("offers TOTP when no factor list is set (the server's MFA_FACTORS default)", () => {
    expect(toWebClientConfig({ ...LOCAL, NEXT_PUBLIC_MFA_FACTORS: undefined }).mfaFactors).toEqual(["totp"]);
  });

  it("splits and de-duplicates the factor list", () => {
    expect(toWebClientConfig({ ...LOCAL, NEXT_PUBLIC_MFA_FACTORS: "totp, phone,totp" }).mfaFactors).toEqual(["totp", "phone"]);
  });

  it("names every invalid field, never a value", () => {
    const build = () => toWebClientConfig({ ...LOCAL, NEXT_PUBLIC_APP_ENV: "qa", NEXT_PUBLIC_FIREBASE_API_KEY: undefined });

    expect(build).toThrow(ClientConfigError);
    expect(build).toThrow(/appEnv.*firebase\.apiKey/);
  });
});
