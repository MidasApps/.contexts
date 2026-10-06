import type { ReportError } from "@core/client/app-shell";
import {
  ApiError,
  type CallEndpoint,
  createEndpointCaller,
  createHttpClient,
  type FetchLike,
  type GetIdToken,
} from "@core/client/shared/api";
import { SecureStoreError, type SecureStorePort } from "@core/client/shared/lib/secure-store";
import type { SessionBridgePort } from "@core/client/shared/lib/session-bridge";
import { createDesktopSessionEndpoint, exchangeDesktopSessionEndpoint, revokeSessionEndpoint } from "@core/contracts";
import {
  type DesktopSessionRecord,
  parseDesktopSessionRecord,
  serializeDesktopSessionRecord,
} from "./desktop-session-record.schema.ts";

export type DesktopSessionBridgeArgs = {
  readonly apiBaseUrl: string;
  readonly fetch: FetchLike;
  /** The OS keychain in Tauri, memory in browser mode (`selectSecureStore`). */
  readonly secureStore: SecureStorePort;
  /** Current Firebase ID token (memory only), for the sign-out revoke. */
  readonly getIdToken: GetIdToken;
  readonly reportError: ReportError;
};

const isUnavailable = (error: unknown): boolean =>
  error instanceof SecureStoreError && error.code === "SECURE_STORE_UNAVAILABLE";

type Context = DesktopSessionBridgeArgs & { readonly callEndpoint: CallEndpoint };

const callerWith = (args: DesktopSessionBridgeArgs, getIdToken: GetIdToken): CallEndpoint =>
  createEndpointCaller(createHttpClient({ baseUrl: args.apiBaseUrl, getIdToken, fetch: args.fetch }));

/** The stored record; an unreadable value is deleted and reported (no content in the report). */
const readRecord = async (ctx: Context): Promise<DesktopSessionRecord | null> => {
  const value = await ctx.secureStore.get();
  if (value === null) return null;
  const record = parseDesktopSessionRecord(value);
  if (record !== null) return record;
  ctx.reportError(new Error("unreadable desktop session record"), { operation: "desktop_session_record" });
  await ctx.secureStore.delete();
  return null;
};

/** Best effort: a failed revoke leaves a session that expires on its own (30 days, sliding). */
const revokeQuietly = async (ctx: Context, callEndpoint: CallEndpoint, sessionId: string): Promise<void> => {
  try {
    await callEndpoint(revokeSessionEndpoint, { params: { sessionId } });
  } catch (error: unknown) {
    ctx.reportError(error, { operation: "desktop_session_revoke" });
  }
};

/** A previous record left behind (a failed restore followed by a new sign-in), or `null`. */
const readLeftover = async (ctx: Context): Promise<DesktopSessionRecord | null> => {
  try {
    return await readRecord(ctx);
  } catch (error: unknown) {
    // The write right after reports the store failure that matters; this one only loses the leftover.
    if (!isUnavailable(error)) ctx.reportError(error, { operation: "desktop_session_record" });
    return null;
  }
};

/**
 * After an interactive sign-in: `POST /v1/me/desktop-sessions` with the fresh token, then the record
 * goes to the keychain. Without a keychain (Linux without Secret Service) the sign-in still succeeds
 * but will not survive a restart (decision 0017); the unstored session is revoked either way.
 */
const establish = async (ctx: Context, idToken: string): Promise<void> => {
  const callEndpoint = callerWith(ctx, () => Promise.resolve(idToken));
  const leftover = await readLeftover(ctx);
  const { data } = await callEndpoint(createDesktopSessionEndpoint, {});
  try {
    await ctx.secureStore.set(serializeDesktopSessionRecord({ v: 1, sessionId: data.sessionId, secret: data.secret }));
  } catch (error: unknown) {
    await revokeQuietly(ctx, callEndpoint, data.sessionId);
    if (!isUnavailable(error)) throw error;
    ctx.reportError(error, { operation: "desktop_session_store" });
    return;
  }
  if (leftover !== null && leftover.sessionId !== data.sessionId)
    await revokeQuietly(ctx, callEndpoint, leftover.sessionId);
};

/**
 * On boot: exchange the stored secret (no Bearer) for a custom token and store the rotated secret
 * before using the token, so the keychain never holds a dead secret. A 401 (revoked, expired, reused)
 * forgets the session; transient failures keep the record for the next start.
 */
const restore = async (ctx: Context): Promise<{ customToken: string } | null> => {
  const record = await readRecord(ctx);
  if (record === null) return null;
  try {
    const { data } = await ctx.callEndpoint(exchangeDesktopSessionEndpoint, { body: { secret: record.secret } });
    await ctx.secureStore.set(serializeDesktopSessionRecord({ ...record, secret: data.secret }));
    return { customToken: data.customToken };
  } catch (error: unknown) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
    await ctx.secureStore.delete();
    return null;
  }
};

/** Sign-out (Firebase still signed in): revoke server-side, then always delete the keychain entry. */
const end = async (ctx: Context): Promise<void> => {
  try {
    const record = await readRecord(ctx);
    if (record !== null) await revokeQuietly(ctx, ctx.callEndpoint, record.sessionId);
  } catch (error: unknown) {
    if (!isUnavailable(error)) ctx.reportError(error, { operation: "desktop_session_record" });
  }
  try {
    await ctx.secureStore.delete();
  } catch (error: unknown) {
    // Nothing can be stored without a keychain, so there is nothing to delete.
    if (!isUnavailable(error)) throw error;
  }
};

/**
 * Session bridge of the desktop (decision 0017 §2, SP1 spec §3.5): the SP1 desktop session over the
 * secure store. The Firebase ID token stays in memory; only the rotating session secret persists.
 */
export const createDesktopSessionBridge = (args: DesktopSessionBridgeArgs): SessionBridgePort => {
  const ctx: Context = { ...args, callEndpoint: callerWith(args, args.getIdToken) };
  return {
    establish: ({ idToken }) => establish(ctx, idToken),
    restore: () => restore(ctx),
    end: () => end(ctx),
  };
};
