import { describe, expect, it } from "vitest";
import type { MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import type { SessionState } from "#/shared/lib/session/session-state.ts";
import { INITIAL_SESSION_STATE, type SessionEvent, sessionReducer } from "./session-machine.ts";

const challenge: MfaChallenge = {
  hints: [{ uid: "h1", factor: "phone", displayName: null, phoneNumber: "+55***" }],
  handle: {},
};

const STATES: Record<SessionState["status"], SessionState> = {
  booting: { status: "booting" },
  exchanging: { status: "exchanging" },
  "signed-out": { status: "signed-out", reason: "none" },
  "mfa-required": { status: "mfa-required", challenge },
  "signed-in": { status: "signed-in", uid: "u1" },
};

const EVENTS: SessionEvent[] = [
  { type: "SESSION_FOUND" },
  { type: "NO_SESSION" },
  { type: "EXCHANGE_SUCCEEDED", uid: "u1" },
  { type: "EXCHANGE_FAILED" },
  { type: "MFA_REQUIRED", challenge },
  { type: "MFA_CANCELLED" },
  { type: "SIGNED_IN", uid: "u1" },
  { type: "SIGNED_OUT" },
  { type: "USER_SWITCHED", uid: "u2" },
];

// Every allowed transition; any other (state, event) pair leaves the state unchanged.
const ALLOWED: [SessionState["status"], SessionEvent["type"], SessionState][] = [
  ["booting", "SESSION_FOUND", { status: "exchanging" }],
  ["booting", "NO_SESSION", { status: "signed-out", reason: "none" }],
  ["booting", "EXCHANGE_FAILED", { status: "signed-out", reason: "session-expired" }],
  ["exchanging", "EXCHANGE_SUCCEEDED", { status: "signed-in", uid: "u1" }],
  ["exchanging", "EXCHANGE_FAILED", { status: "signed-out", reason: "session-expired" }],
  ["exchanging", "SIGNED_OUT", { status: "signed-out", reason: "signed-out" }],
  ["signed-out", "SIGNED_IN", { status: "signed-in", uid: "u1" }],
  ["signed-out", "MFA_REQUIRED", { status: "mfa-required", challenge }],
  ["mfa-required", "SIGNED_IN", { status: "signed-in", uid: "u1" }],
  ["mfa-required", "MFA_CANCELLED", { status: "signed-out", reason: "none" }],
  ["mfa-required", "SIGNED_OUT", { status: "signed-out", reason: "signed-out" }],
  ["signed-in", "SIGNED_OUT", { status: "signed-out", reason: "signed-out" }],
  // Support access enters or leaves an impersonation in the same tab (decision 0047).
  ["signed-in", "USER_SWITCHED", { status: "signed-in", uid: "u2" }],
];

describe("sessionReducer", () => {
  it("starts booting", () => {
    expect(INITIAL_SESSION_STATE).toEqual({ status: "booting" });
  });

  it.each(ALLOWED)("%s + %s → next state", (from, event, next) => {
    const eventObject = EVENTS.find((candidate) => candidate.type === event);
    expect(sessionReducer(STATES[from], eventObject!)).toEqual(next);
  });

  it("ignores every other event (returns the same state object)", () => {
    const allowed = new Set(ALLOWED.map(([from, event]) => `${from}:${event}`));
    for (const [status, state] of Object.entries(STATES)) {
      for (const event of EVENTS) {
        if (allowed.has(`${status}:${event.type}`)) continue;
        expect(sessionReducer(state, event), `${status} + ${event.type}`).toBe(state);
      }
    }
  });
});
