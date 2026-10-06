"use server";

import type { SessionActionResult } from "@core/services";
import { runSessionAction } from "@/server/session-action-context";

// Server Actions of the web session only (decision 0011 §4): one-line wrappers over SP1's
// framework-free session actions; every product mutation goes through /v1. Each validates its
// own input and checks the request Origin (SP1 session-actions).

/** Sets the `__session` cookie from a fresh ID token. */
export async function createSession(input: { idToken: string }): Promise<SessionActionResult<{ expiresAt: string }>> {
  return runSessionAction("createSession", (actions, context) => actions.createSession(input, context));
}

/** Exchanges the `__session` cookie for a custom token (boot). */
export async function exchangeSession(): Promise<SessionActionResult<{ customToken: string }>> {
  return runSessionAction("exchangeSession", (actions, context) => actions.exchangeSession(context));
}

/** Staff opens the app as the user of an open impersonation session; kept across reloads (decision 0047). */
export async function enterImpersonation(input: {
  impersonationSessionId: string;
}): Promise<SessionActionResult<{ customToken: string }>> {
  return runSessionAction("enterImpersonation", (actions, context) => actions.enterImpersonation(input, context));
}

/** Ends the impersonation and returns the staff account custom token (decision 0047). */
export async function leaveImpersonation(): Promise<SessionActionResult<{ customToken: string }>> {
  return runSessionAction("leaveImpersonation", (actions, context) => actions.leaveImpersonation(context));
}

/** Revokes the session and deletes the cookie. */
export async function signOut(): Promise<SessionActionResult<null>> {
  return runSessionAction("signOut", (actions, context) => actions.signOut(context));
}
