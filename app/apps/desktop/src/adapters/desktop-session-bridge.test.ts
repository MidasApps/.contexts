import { createMemorySecureStore, SecureStoreError, type SecureStorePort } from "@core/client/shared/lib/secure-store";
import { describe, expect, it } from "vitest";
import { createDesktopSessionBridge } from "./desktop-session-bridge.ts";

const API = "https://api.example.test";
const EXPIRES_AT = "2026-10-30T00:00:00.000Z";
/** 43-char base64url secret number `n` (the contract's shape). */
const secretNo = (n: number): string => `S${String(n).padStart(42, "0")}`;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = (): Response =>
  json(401, { error: { code: "UNAUTHORIZED", message: "Unauthorized.", requestId: "req-1" } });

type Request = {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
  readonly body: unknown;
};

/** SP1's desktop session endpoints in memory: create, exchange (rotating), revoke. */
const fakeApi = () => {
  const requests: Request[] = [];
  const sessions = new Map<string, { secret: string; revoked: boolean }>();
  let issued = 0;
  const respond = (input: string, init?: RequestInit): Response => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: headers.get("authorization"),
      body,
    });
    if (url.pathname === "/v1/me/desktop-sessions") {
      const sessionId = `session-${String(sessions.size + 1)}`;
      sessions.set(sessionId, { secret: secretNo(++issued), revoked: false });
      return json(201, { data: { sessionId, secret: secretNo(issued), expiresAt: EXPIRES_AT } });
    }
    if (url.pathname === "/v1/desktop-sessions/exchange") {
      const presented = (body as { secret: string }).secret;
      const session = [...sessions.values()].find((candidate) => candidate.secret === presented && !candidate.revoked);
      if (session === undefined) return unauthorized();
      session.secret = secretNo(++issued);
      return json(200, {
        data: { customToken: `custom-token-${String(issued)}`, secret: session.secret, expiresAt: EXPIRES_AT },
      });
    }
    const revoked = /^\/v1\/me\/sessions\/(.+)$/u.exec(url.pathname);
    if (revoked !== null && init?.method === "DELETE") {
      const session = sessions.get(revoked[1] ?? "");
      if (session === undefined)
        return json(404, { error: { code: "NOT_FOUND", message: "Not found.", requestId: "req-2" } });
      session.revoked = true;
      return new Response(null, { status: 204 });
    }
    return json(500, { error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: "req-3" } });
  };
  const fetch = (input: string, init?: RequestInit): Promise<Response> => Promise.resolve(respond(input, init));
  return { fetch, requests, sessions };
};

const setup = (options: { secureStore?: SecureStorePort; fetch?: typeof fetch } = {}) => {
  const api = fakeApi();
  const secureStore = options.secureStore ?? createMemorySecureStore();
  const reported: string[] = [];
  const bridge = createDesktopSessionBridge({
    apiBaseUrl: API,
    fetch: options.fetch ?? api.fetch,
    secureStore,
    getIdToken: () => Promise.resolve("current-id-token"),
    reportError: (_error, context) => reported.push(context.operation),
  });
  return { api, bridge, secureStore, reported };
};

const storedRecord = async (store: SecureStorePort): Promise<unknown> => {
  const value = await store.get();
  return value === null ? null : JSON.parse(value);
};

describe("createDesktopSessionBridge", () => {
  it("creates a desktop session with the fresh ID token and keeps its record in the secure store", async () => {
    const { api, bridge, secureStore } = setup();

    await bridge.establish({ idToken: "fresh-id-token" });

    expect(api.requests).toEqual([
      { method: "POST", path: "/v1/me/desktop-sessions", authorization: "Bearer fresh-id-token", body: undefined },
    ]);
    await expect(storedRecord(secureStore)).resolves.toEqual({ v: 1, sessionId: "session-1", secret: secretNo(1) });
  });

  it("restores after a restart: exchanges the stored secret without a Bearer and stores the rotated one", async () => {
    const { api, bridge, secureStore } = setup();
    await bridge.establish({ idToken: "fresh-id-token" });

    await expect(bridge.restore()).resolves.toEqual({ customToken: "custom-token-2" });
    await expect(bridge.restore()).resolves.toEqual({ customToken: "custom-token-3" });

    const exchanges = api.requests.filter((request) => request.path === "/v1/desktop-sessions/exchange");
    expect(exchanges).toEqual([
      { method: "POST", path: "/v1/desktop-sessions/exchange", authorization: null, body: { secret: secretNo(1) } },
      { method: "POST", path: "/v1/desktop-sessions/exchange", authorization: null, body: { secret: secretNo(2) } },
    ]);
    await expect(storedRecord(secureStore)).resolves.toEqual({ v: 1, sessionId: "session-1", secret: secretNo(3) });
  });

  it("restores nothing when the secure store is empty, without calling the API", async () => {
    const { api, bridge } = setup();

    await expect(bridge.restore()).resolves.toBeNull();
    expect(api.requests).toEqual([]);
  });

  it("forgets a session the server refuses (revoked, expired, rotated) and restores nothing", async () => {
    const { bridge, secureStore } = setup({
      secureStore: createMemorySecureStore(JSON.stringify({ v: 1, sessionId: "gone", secret: secretNo(99) })),
    });

    await expect(bridge.restore()).resolves.toBeNull();
    await expect(secureStore.get()).resolves.toBeNull();
  });

  it("drops an unreadable record and restores nothing", async () => {
    const { api, bridge, secureStore, reported } = setup({ secureStore: createMemorySecureStore("not json") });

    await expect(bridge.restore()).resolves.toBeNull();
    await expect(secureStore.get()).resolves.toBeNull();
    expect(api.requests).toEqual([]);
    expect(reported).toEqual(["desktop_session_record"]);
  });

  it("keeps the record when the exchange fails for a transient reason (network), so the next start retries", async () => {
    const record = JSON.stringify({ v: 1, sessionId: "session-1", secret: secretNo(1) });
    const { bridge, secureStore } = setup({
      secureStore: createMemorySecureStore(record),
      fetch: () => Promise.reject(new TypeError("offline")),
    });

    await expect(bridge.restore()).rejects.toMatchObject({ name: "ApiError", code: "NETWORK_ERROR" });
    await expect(secureStore.get()).resolves.toBe(record);
  });

  it("signs out: revokes the session with the current ID token and deletes the keychain entry", async () => {
    const { api, bridge, secureStore } = setup();
    await bridge.establish({ idToken: "fresh-id-token" });

    await bridge.end();

    expect(api.requests.at(-1)).toEqual({
      method: "DELETE",
      path: "/v1/me/sessions/session-1",
      authorization: "Bearer current-id-token",
      body: undefined,
    });
    expect(api.sessions.get("session-1")?.revoked).toBe(true);
    await expect(secureStore.get()).resolves.toBeNull();
    await expect(bridge.restore()).resolves.toBeNull();
  });

  it("deletes the keychain entry even when the server revoke fails, and reports it", async () => {
    const record = JSON.stringify({ v: 1, sessionId: "session-1", secret: secretNo(1) });
    const { bridge, secureStore, reported } = setup({
      secureStore: createMemorySecureStore(record),
      fetch: () => Promise.reject(new TypeError("offline")),
    });

    await bridge.end();

    await expect(secureStore.get()).resolves.toBeNull();
    expect(reported).toEqual(["desktop_session_revoke"]);
  });

  it("revokes the previous session when a new sign-in replaces a leftover record", async () => {
    const { api, bridge, secureStore } = setup();
    await bridge.establish({ idToken: "first-id-token" });

    await bridge.establish({ idToken: "second-id-token" });

    expect(api.sessions.get("session-1")?.revoked).toBe(true);
    await expect(storedRecord(secureStore)).resolves.toEqual({ v: 1, sessionId: "session-2", secret: secretNo(2) });
  });

  it("signs in without persistence when no keychain is available: the new session is revoked and reported", async () => {
    const unavailable = new SecureStoreError("SECURE_STORE_UNAVAILABLE");
    const secureStore: SecureStorePort = {
      get: () => Promise.reject(unavailable),
      set: () => Promise.reject(unavailable),
      delete: () => Promise.reject(unavailable),
    };
    const { api, bridge, reported } = setup({ secureStore });

    await expect(bridge.establish({ idToken: "fresh-id-token" })).resolves.toBeUndefined();
    await expect(bridge.end()).resolves.toBeUndefined();

    expect(api.sessions.get("session-1")?.revoked).toBe(true);
    expect(reported).toContain("desktop_session_store");
  });

  it("fails the sign-in when the keychain write fails unexpectedly (and revokes the unstored session)", async () => {
    const failed = new SecureStoreError("SECURE_STORE_FAILED");
    const secureStore: SecureStorePort = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(failed),
      delete: () => Promise.resolve(),
    };
    const { api, bridge } = setup({ secureStore });

    await expect(bridge.establish({ idToken: "fresh-id-token" })).rejects.toBe(failed);
    expect(api.sessions.get("session-1")?.revoked).toBe(true);
  });
});
