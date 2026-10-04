import { ImpersonationSessionIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { signInWithCustomToken, signUpWithPassword } from "../../../shared/testing/auth-emulator-rest.fixture.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  emulatorFirebase,
} from "../../../shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreSessionRepository } from "../driven/firestore-session-repository.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const harness = buildEmulatorServer({ firebase, uids: [] });
const { sessions } = harness.server;

const exchangeDesktop = (secret: string) =>
  harness.call("identity.exchangeDesktopSession", {
    method: "POST",
    path: "/v1/desktop-sessions/exchange",
    body: { secret },
  });

let email = "";
let accounts = 0;
beforeEach(async () => {
  await clearCoreCollections(firestore);
  // One Auth Emulator per `emulators:exec` run: a counter keeps the emails unique.
  email = `session-${(accounts += 1)}@example.com`;
}, 30_000);

describe("sessions (Auth Emulator)", () => {
  it("creates a web session from a fresh ID token, exchanges it, and revoke-all kills cookie and desktop exchange", {
    timeout: 60_000,
  }, async () => {
    const signUp = await signUpWithPassword(email, "correct-horse-battery");
    const uid = UserIdSchema.parse(signUp.localId ?? "");

    const created = await sessions.createWebSession({
      idToken: signUp.idToken,
      userAgent: "Mozilla/5.0 (Windows NT 10.0) Firefox/143.0",
    });
    if (!created.ok) throw created.error;
    expect((await auth.verifySessionCookie(created.data.cookie, true)).uid).toBe(uid);
    const stored = (await firestore.collection(CORE_COLLECTIONS.sessions).doc(created.data.sessionId).get()).data();
    expect(stored).toMatchObject({ uid, kind: "web", mfa: false, userAgent: "Firefox on Windows", revokedAt: null });
    expect(JSON.stringify(stored)).not.toContain(created.data.cookie);

    const exchanged = await sessions.exchangeWebSession({ cookie: created.data.cookie });
    if (!exchanged.ok) throw exchanged.error;
    const signedIn = await signInWithCustomToken(exchanged.data.customToken);
    const decoded = await auth.verifyIdToken(signedIn.idToken, true);
    expect(decoded).toMatchObject({
      uid,
      smfa: false,
      sessionId: created.data.sessionId,
      firebase: { sign_in_provider: "custom" },
    });
    expect(await sessions.requireWebSession({ cookie: created.data.cookie })).toMatchObject({
      ok: true,
      data: { principal: { uid } },
    });

    const desktop = await sessions.createDesktopSession({ actor: { type: "user", uid, mfa: false }, userAgent: null });
    if (!desktop.ok) throw desktop.error;
    const rotated = await exchangeDesktop(desktop.data.secret);
    expect(rotated.status).toBe(200);
    const rotatedBody = (await rotated.json()) as { data: { customToken: string; secret: string } };
    expect((await auth.verifyIdToken((await signInWithCustomToken(rotatedBody.data.customToken)).idToken)).uid).toBe(
      uid,
    );

    expect(
      await sessions.revokeAllSessions({ actor: { type: "user", uid, mfa: false }, requestId: "r-revoke" }),
    ).toEqual({ ok: true, data: 2 });
    expect((await auth.getUser(uid)).tokensValidAfterTime).toBeDefined();
    expect(await sessions.requireWebSession({ cookie: created.data.cookie })).toMatchObject({ ok: false });
    expect(await sessions.exchangeWebSession({ cookie: created.data.cookie })).toMatchObject({ ok: false });
    expect((await exchangeDesktop(rotatedBody.data.secret)).status).toBe(401);
  });

  it("stores and clears the impersonation marker; a marker without a usable session restores staff (decision 0047)", {
    timeout: 60_000,
  }, async () => {
    const signUp = await signUpWithPassword(email, "correct-horse-battery");
    const uid = UserIdSchema.parse(signUp.localId ?? "");
    const created = await sessions.createWebSession({ idToken: signUp.idToken, userAgent: null });
    if (!created.ok) throw created.error;
    const repository = createFirestoreSessionRepository({ firestore });
    await repository.setImpersonation({
      id: created.data.sessionId,
      impersonationSessionId: ImpersonationSessionIdSchema.parse("imp-missing"),
    });
    expect((await repository.get(undefined, created.data.sessionId))?.impersonationSessionId).toBe("imp-missing");

    const exchanged = await sessions.exchangeWebSession({ cookie: created.data.cookie });
    if (!exchanged.ok) throw exchanged.error;
    const decoded = await auth.verifyIdToken((await signInWithCustomToken(exchanged.data.customToken)).idToken);
    expect(decoded.uid).toBe(uid);
    expect(decoded["imp"]).toBeUndefined();
    expect((await repository.get(undefined, created.data.sessionId))?.impersonationSessionId).toBeNull();
  });

  it("revokes a desktop session whose rotated secret is presented again", { timeout: 60_000 }, async () => {
    const signUp = await signUpWithPassword(email, "correct-horse-battery");
    const uid = UserIdSchema.parse(signUp.localId ?? "");
    const desktop = await sessions.createDesktopSession({ actor: { type: "user", uid, mfa: false }, userAgent: null });
    if (!desktop.ok) throw desktop.error;
    const first = (await (await exchangeDesktop(desktop.data.secret)).json()) as { data: { secret: string } };

    expect((await exchangeDesktop(desktop.data.secret)).status).toBe(401);
    expect(
      (await firestore.collection(CORE_COLLECTIONS.sessions).doc(desktop.data.sessionId).get()).get("revokedAt"),
    ).not.toBeNull();
    expect((await exchangeDesktop(first.data.secret)).status).toBe(401);
    const audits = await firestore
      .collection("platform-audit-logs")
      .where("action", "==", "DESKTOP_SESSION_REUSE_DETECTED")
      .get();
    expect(audits.docs.map((doc) => doc.data()["target"] as unknown)).toEqual([
      { type: "session", id: desktop.data.sessionId },
    ]);
  });

  it("refuses an ID token from an old sign-in", { timeout: 30_000 }, async () => {
    const signUp = await signUpWithPassword(email, "correct-horse-battery");
    const later = buildEmulatorServer({ firebase, uids: [], clock: { now: () => new Date(Date.now() + 6 * 60_000) } });
    expect(await later.server.sessions.createWebSession({ idToken: signUp.idToken, userAgent: null })).toMatchObject({
      ok: false,
      error: { code: "RECENT_SIGN_IN_REQUIRED" },
    });
  });
});
