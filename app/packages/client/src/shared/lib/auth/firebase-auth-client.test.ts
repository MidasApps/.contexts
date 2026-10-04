import { describe, expect, it, vi } from "vitest";
import type { ClientConfig } from "#/shared/config/client-config.schema.ts";
import { AuthError } from "./auth-port.ts";
import { guardAuth, toAuthError } from "./firebase-errors.ts";
import { initializeFirebaseAuth } from "./firebase-auth-client.ts";

const baseConfig = {
  apiBaseUrl: "",
  firebase: { apiKey: "public-key", authDomain: "demo.firebaseapp.com", projectId: "demo-core" },
  mfaFactors: ["phone"],
} satisfies Omit<ClientConfig, "appEnv">;

/** Fake SDK functions: records calls, returns plain objects. */
const fakeSdk = () => {
  const auth = { settings: { appVerificationDisabledForTesting: false } };
  const sdk = {
    initializeApp: vi.fn((options: ClientConfig["firebase"]) => ({ options })),
    initializeAuth: vi.fn<(app: { options: ClientConfig["firebase"] }, deps: { persistence: string }) => typeof auth>(() => auth),
    inMemoryPersistence: "in-memory",
    connectAuthEmulator: vi.fn(),
  };
  return { sdk, auth };
};

describe("initializeFirebaseAuth", () => {
  it("uses in-memory persistence and connects the Auth Emulator only in local", () => {
    const { sdk, auth } = fakeSdk();
    const result = initializeFirebaseAuth({ ...baseConfig, appEnv: "local", authEmulatorUrl: "http://127.0.0.1:9099" }, sdk);
    expect(result).toBe(auth);
    expect(sdk.initializeApp).toHaveBeenCalledWith(baseConfig.firebase);
    expect(sdk.initializeAuth).toHaveBeenCalledWith({ options: baseConfig.firebase }, { persistence: "in-memory" });
    expect(sdk.connectAuthEmulator).toHaveBeenCalledWith(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    expect(auth.settings.appVerificationDisabledForTesting).toBe(true);
  });

  it.each(["dev", "staging", "prod"] as const)("never connects the emulator nor disables app verification in %s", (appEnv) => {
    const { sdk, auth } = fakeSdk();
    initializeFirebaseAuth({ ...baseConfig, appEnv }, sdk);
    expect(sdk.connectAuthEmulator).not.toHaveBeenCalled();
    expect(auth.settings.appVerificationDisabledForTesting).toBe(false);
    expect(sdk.initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: "in-memory" });
  });
});

describe("auth errors", () => {
  it("maps Firebase codes to stable AuthError codes and keeps the SDK error as cause", async () => {
    const sdkError = Object.assign(new Error("Firebase: Error (auth/invalid-credential)."), { code: "auth/invalid-credential" });
    expect(toAuthError(sdkError)).toMatchObject({ code: "INVALID_CREDENTIALS", cause: sdkError });
    expect(toAuthError({ code: "auth/too-many-requests" }).code).toBe("RATE_LIMITED");
    expect(toAuthError(new Error("boom")).code).toBe("AUTH_FAILED");
    await expect(guardAuth(() => Promise.reject(sdkError))).rejects.toBeInstanceOf(AuthError);
    expect(toAuthError(sdkError).message).not.toContain("Firebase");
  });
});
