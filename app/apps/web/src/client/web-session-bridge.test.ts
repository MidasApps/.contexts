import { ApiError } from "@core/client/shared/api";
import { describe, expect, it } from "vitest";
import { createWebSessionBridge, type WebSessionActions } from "./web-session-bridge";

const REQUEST_ID = "01K6BZ3YQ8X4M7N2P5R9T0V1W2";
const failure = (code: string) => ({ ok: false as const, error: { code, message: "generic", requestId: REQUEST_ID } });

const actions = (overrides: Partial<WebSessionActions> = {}): WebSessionActions & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    createSession: (input) => {
      calls.push(["createSession", input]);
      return Promise.resolve({ ok: true, data: { expiresAt: "2026-10-05T00:00:00.000Z" } });
    },
    exchangeSession: () => Promise.resolve({ ok: true, data: { customToken: "custom-token" } }),
    signOut: () => {
      calls.push(["signOut"]);
      return Promise.resolve({ ok: true, data: null });
    },
    ...overrides,
  };
};

describe("createWebSessionBridge", () => {
  it("establishes the session with the fresh ID token through the createSession action", async () => {
    const fake = actions();

    await createWebSessionBridge(fake).establish({ idToken: "id-token" });

    expect(fake.calls).toEqual([["createSession", { idToken: "id-token" }]]);
  });

  it("raises the action's error as an ApiError with its code and request id", async () => {
    const bridge = createWebSessionBridge(actions({ createSession: () => Promise.resolve(failure("RECENT_SIGN_IN_REQUIRED")) }));

    const error: unknown = await bridge.establish({ idToken: "old" }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "RECENT_SIGN_IN_REQUIRED", status: 401, requestId: REQUEST_ID });
  });

  it("restores a custom token, or nothing when no session cookie survives", async () => {
    expect(await createWebSessionBridge(actions()).restore()).toEqual({ customToken: "custom-token" });
    expect(await createWebSessionBridge(actions({ exchangeSession: () => Promise.resolve(failure("UNAUTHORIZED")) })).restore()).toBeNull();
  });

  it("fails the restore for any other refusal (a misconfigured origin must be reported, not hidden)", async () => {
    const bridge = createWebSessionBridge(actions({ exchangeSession: () => Promise.resolve(failure("FORBIDDEN")) }));

    await expect(bridge.restore()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("ends the session through the signOut action and raises its refusal", async () => {
    const fake = actions();
    await createWebSessionBridge(fake).end();
    expect(fake.calls).toEqual([["signOut"]]);

    await expect(createWebSessionBridge(actions({ signOut: () => Promise.resolve(failure("FORBIDDEN")) })).end()).rejects.toBeInstanceOf(ApiError);
  });
});
