import type { MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import type { SessionState } from "#/shared/lib/session/session-state.ts";

/** What happened to the session; the provider dispatches these from ports and user actions. */
export type SessionEvent =
  | { readonly type: "SESSION_FOUND" }
  | { readonly type: "NO_SESSION" }
  | { readonly type: "EXCHANGE_SUCCEEDED"; readonly uid: string }
  | { readonly type: "EXCHANGE_FAILED" }
  | { readonly type: "MFA_REQUIRED"; readonly challenge: MfaChallenge }
  | { readonly type: "MFA_CANCELLED" }
  | { readonly type: "SIGNED_IN"; readonly uid: string }
  | { readonly type: "SIGNED_OUT" }
  /** The same tab now runs as another Firebase user: support access entered or left (decision 0047). */
  | { readonly type: "USER_SWITCHED"; readonly uid: string };

export const INITIAL_SESSION_STATE: SessionState = { status: "booting" };

const bootTransition = (state: SessionState, event: SessionEvent): SessionState => {
  if (event.type === "SESSION_FOUND") return { status: "exchanging" };
  if (event.type === "NO_SESSION") return { status: "signed-out", reason: "none" };
  if (event.type === "EXCHANGE_FAILED") return { status: "signed-out", reason: "session-expired" };
  return state;
};

const exchangeTransition = (state: SessionState, event: SessionEvent): SessionState => {
  if (event.type === "EXCHANGE_SUCCEEDED") return { status: "signed-in", uid: event.uid };
  if (event.type === "EXCHANGE_FAILED") return { status: "signed-out", reason: "session-expired" };
  if (event.type === "SIGNED_OUT") return { status: "signed-out", reason: "signed-out" };
  return state;
};

const signedOutTransition = (state: SessionState, event: SessionEvent): SessionState => {
  if (event.type === "SIGNED_IN") return { status: "signed-in", uid: event.uid };
  if (event.type === "MFA_REQUIRED") return { status: "mfa-required", challenge: event.challenge };
  return state;
};

const mfaTransition = (state: SessionState, event: SessionEvent): SessionState => {
  if (event.type === "SIGNED_IN") return { status: "signed-in", uid: event.uid };
  if (event.type === "MFA_CANCELLED") return { status: "signed-out", reason: "none" };
  if (event.type === "SIGNED_OUT") return { status: "signed-out", reason: "signed-out" };
  return state;
};

/**
 * Pure session reducer: `booting → signed-out | exchanging → signed-in`, and from `signed-out`
 * an interactive sign-in → `signed-in | mfa-required`. An event that does not apply to the current
 * state returns the same state object (late port callbacks cannot move the session backwards).
 */
export const sessionReducer = (state: SessionState, event: SessionEvent): SessionState => {
  switch (state.status) {
    case "booting":
      return bootTransition(state, event);
    case "exchanging":
      return exchangeTransition(state, event);
    case "signed-out":
      return signedOutTransition(state, event);
    case "mfa-required":
      return mfaTransition(state, event);
    case "signed-in":
      if (event.type === "USER_SWITCHED") return { status: "signed-in", uid: event.uid };
      return event.type === "SIGNED_OUT" ? { status: "signed-out", reason: "signed-out" } : state;
  }
};
