import type { Auth } from "firebase/auth";
import { describe, expect, it, vi } from "vitest";
import { createFirebaseAccountActions, type FirebaseAccountSdk } from "./firebase-account.ts";

const sdkError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

const fakeSdk = (overrides: Partial<FirebaseAccountSdk> = {}) => {
  const user = { uid: "new-user" };
  const sdk: FirebaseAccountSdk = {
    createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user })) as unknown as FirebaseAccountSdk["createUserWithEmailAndPassword"],
    updateProfile: vi.fn(() => Promise.resolve()),
    sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const auth = { languageCode: null } as unknown as Auth;
  return { sdk, auth, user };
};

describe("createAccount", () => {
  it("creates the account, sets its display name and answers signed in", async () => {
    const { sdk, auth, user } = fakeSdk();
    const result = await createFirebaseAccountActions(sdk, auth).createAccount({ email: "ana@example.com", password: "long-password", displayName: "Ana Souza" });
    expect(result).toEqual({ kind: "signed-in" });
    expect(sdk.createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, "ana@example.com", "long-password");
    expect(sdk.updateProfile).toHaveBeenCalledWith(user, { displayName: "Ana Souza" });
  });

  it.each([
    ["auth/email-already-in-use", "EMAIL_ALREADY_IN_USE"],
    ["auth/weak-password", "WEAK_PASSWORD"],
    ["auth/operation-not-allowed", "ACCOUNT_CREATION_DISABLED"],
    ["auth/admin-restricted-operation", "ACCOUNT_CREATION_DISABLED"],
    ["auth/network-request-failed", "NETWORK_ERROR"],
  ])("maps %s to %s", async (code, expected) => {
    const { sdk, auth } = fakeSdk({ createUserWithEmailAndPassword: vi.fn(() => Promise.reject(sdkError(code))) });
    await expect(createFirebaseAccountActions(sdk, auth).createAccount({ email: "ana@example.com", password: "x", displayName: "Ana" })).rejects.toMatchObject({ code: expected });
  });
});

describe("sendPasswordReset", () => {
  it("sends the email in the UI language", async () => {
    const { sdk, auth } = fakeSdk();
    await createFirebaseAccountActions(sdk, auth).sendPasswordReset("ana@example.com", "es-419");
    expect(sdk.sendPasswordResetEmail).toHaveBeenCalledWith(auth, "ana@example.com");
    expect(auth.languageCode).toBe("es-419");
  });

  it.each(["auth/user-not-found", "auth/invalid-email", "auth/user-disabled"])("answers like a success for %s, so it never tells which accounts exist", async (code) => {
    const { sdk, auth } = fakeSdk({ sendPasswordResetEmail: vi.fn(() => Promise.reject(sdkError(code))) });
    await expect(createFirebaseAccountActions(sdk, auth).sendPasswordReset("ghost@example.com", "pt-BR")).resolves.toBeUndefined();
  });

  it("still reports failures the user can act on", async () => {
    const { sdk, auth } = fakeSdk({ sendPasswordResetEmail: vi.fn(() => Promise.reject(sdkError("auth/too-many-requests"))) });
    await expect(createFirebaseAccountActions(sdk, auth).sendPasswordReset("ana@example.com", "pt-BR")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
