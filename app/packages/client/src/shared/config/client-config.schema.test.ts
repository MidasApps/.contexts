import { describe, expect, it } from "vitest";
import { ClientConfigError, parseClientConfig } from "./client-config.schema.ts";

const remote = {
  appEnv: "staging",
  apiBaseUrl: "https://api.example.com",
  firebase: { apiKey: "public-key", authDomain: "demo.firebaseapp.com", projectId: "demo" },
  mfaFactors: ["totp"],
};

describe("parseClientConfig", () => {
  it("accepts the public config of a remote environment and the web's same-origin base URL", () => {
    expect(parseClientConfig(remote)).toEqual(remote);
    expect(parseClientConfig({ ...remote, apiBaseUrl: "" }).apiBaseUrl).toBe("");
  });

  it("requires the Auth Emulator URL in local and forbids it elsewhere", () => {
    expect(() => parseClientConfig({ ...remote, appEnv: "local", mfaFactors: ["phone"] })).toThrow(ClientConfigError);
    expect(() => parseClientConfig({ ...remote, authEmulatorUrl: "http://127.0.0.1:9099" })).toThrow(ClientConfigError);
    const local = parseClientConfig({
      ...remote,
      appEnv: "local",
      authEmulatorUrl: "http://127.0.0.1:9099",
      mfaFactors: ["phone"],
    });
    expect(local.authEmulatorUrl).toBe("http://127.0.0.1:9099");
  });

  it("lists every invalid field in the error, never the values", () => {
    const error = (() => {
      try {
        parseClientConfig({ ...remote, apiBaseUrl: "not a url", mfaFactors: ["sms"], firebase: { apiKey: "" } });
      } catch (thrown: unknown) {
        return thrown;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ClientConfigError);
    expect((error as ClientConfigError).fields).toEqual(
      expect.arrayContaining(["apiBaseUrl", "mfaFactors.0", "firebase.apiKey"]),
    );
    expect((error as ClientConfigError).message).not.toContain("not a url");
  });
});
