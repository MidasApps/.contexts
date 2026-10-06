import { describe, expect, it } from "vitest";
import { InvalidDesktopEnvError, loadDesktopEnv } from "./desktop-env.schema.ts";

const LOCAL = {
  VITE_API_URL: "http://localhost:3100",
  VITE_APP_ENV: "local",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-core.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-core",
  VITE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_MFA_FACTORS: "phone",
};

const REMOTE = {
  ...LOCAL,
  VITE_API_URL: "https://api.example.com",
  VITE_APP_ENV: "staging",
  VITE_AUTH_EMULATOR_URL: undefined,
  VITE_MFA_FACTORS: "totp",
};

const fieldsOf = (source: Record<string, unknown>): readonly string[] => {
  try {
    loadDesktopEnv(source);
  } catch (error: unknown) {
    if (error instanceof InvalidDesktopEnvError) return error.fields;
    throw error;
  }
  return [];
};

describe("loadDesktopEnv", () => {
  it("accepts the local env with the Auth Emulator and parses the MFA factor list", () => {
    expect(loadDesktopEnv(LOCAL)).toEqual({ ...LOCAL, VITE_MFA_FACTORS: ["phone"] });
  });

  it("accepts a remote env without the emulator", () => {
    const env = loadDesktopEnv({ ...REMOTE, VITE_MFA_FACTORS: "totp, phone" });
    expect(env.VITE_AUTH_EMULATOR_URL).toBeUndefined();
    expect(env.VITE_MFA_FACTORS).toEqual(["totp", "phone"]);
    expect(loadDesktopEnv({ ...REMOTE, VITE_SELF_SERVE_SIGN_UP: "true" }).VITE_SELF_SERVE_SIGN_UP).toBe(true);
    expect(() => loadDesktopEnv({ ...REMOTE, VITE_SELF_SERVE_SIGN_UP: "yes" })).toThrow(/VITE_SELF_SERVE_SIGN_UP/);
  });

  it("drops a trailing slash so paths can be appended", () => {
    expect(loadDesktopEnv({ ...REMOTE, VITE_API_URL: "https://api.example.com/" }).VITE_API_URL).toBe(
      "https://api.example.com",
    );
  });

  it("reads an empty MFA list and an empty emulator URL as none (Vite env files have no unset)", () => {
    const env = loadDesktopEnv({ ...REMOTE, VITE_MFA_FACTORS: "", VITE_AUTH_EMULATOR_URL: "" });
    expect(env.VITE_MFA_FACTORS).toEqual([]);
    expect(env.VITE_AUTH_EMULATOR_URL).toBeUndefined();
  });

  it.each([
    ["missing", undefined],
    ["not a URL", "localhost:3000"],
    ["a non-http scheme", "ftp://api.example.com"],
    ["plain http to a remote host", "http://api.example.com"],
    ["a path", "https://api.example.com/v1"],
  ])("rejects an API URL that is %s, naming the variable but never its value", (_label, value) => {
    const load = () => loadDesktopEnv({ ...REMOTE, VITE_API_URL: value });

    expect(load).toThrow(InvalidDesktopEnvError);
    expect(load).toThrow(/VITE_API_URL/);
    if (value) expect(load).not.toThrow(value);
  });

  it("requires the Auth Emulator in local and forbids it elsewhere (follow-up #12c)", () => {
    expect(fieldsOf({ ...LOCAL, VITE_AUTH_EMULATOR_URL: undefined })).toEqual(["VITE_AUTH_EMULATOR_URL"]);
    expect(fieldsOf({ ...REMOTE, VITE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099" })).toEqual([
      "VITE_AUTH_EMULATOR_URL",
    ]);
  });

  it("accepts the Storage Emulator in local only, as a loopback http origin, and it stays optional", () => {
    expect(
      loadDesktopEnv({ ...LOCAL, VITE_STORAGE_EMULATOR_URL: "http://127.0.0.1:9199/" }).VITE_STORAGE_EMULATOR_URL,
    ).toBe("http://127.0.0.1:9199");
    expect(loadDesktopEnv({ ...LOCAL, VITE_STORAGE_EMULATOR_URL: "" }).VITE_STORAGE_EMULATOR_URL).toBeUndefined();
    expect(fieldsOf({ ...REMOTE, VITE_STORAGE_EMULATOR_URL: "http://127.0.0.1:9199" })).toEqual([
      "VITE_STORAGE_EMULATOR_URL",
    ]);
    expect(fieldsOf({ ...LOCAL, VITE_STORAGE_EMULATOR_URL: "http://storage.example.com:9199" })).toEqual([
      "VITE_STORAGE_EMULATOR_URL",
    ]);
  });

  it("accepts the emulator only as a loopback http origin", () => {
    expect(fieldsOf({ ...LOCAL, VITE_AUTH_EMULATOR_URL: "http://emulator.example.com:9099" })).toEqual([
      "VITE_AUTH_EMULATOR_URL",
    ]);
    expect(fieldsOf({ ...LOCAL, VITE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099/path" })).toEqual([
      "VITE_AUTH_EMULATOR_URL",
    ]);
  });

  it("lists every invalid variable at once", () => {
    const fields = fieldsOf({
      VITE_API_URL: "https://api.example.com",
      VITE_APP_ENV: "production",
      VITE_MFA_FACTORS: "sms",
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        "VITE_APP_ENV",
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_MFA_FACTORS",
      ]),
    );
  });

  it("ignores other variables (Vite adds MODE, DEV, PROD, BASE_URL)", () => {
    expect(loadDesktopEnv({ ...LOCAL, MODE: "development", DEV: true })).toEqual({
      ...LOCAL,
      VITE_MFA_FACTORS: ["phone"],
    });
  });
});
