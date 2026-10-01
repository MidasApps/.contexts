import type { StaffSessionGuardResult, WebSessionGuardResult } from "@core/services";
import { describe, expect, it } from "vitest";
import { enforceStaffSession, enforceWebSession, signInHref } from "./guards";

// Next's redirect()/notFound() throw; the fakes do too, so each outcome ends the render.
class Redirected extends Error {}
class NotFound extends Error {}

const outcomes = (locale: "pt-BR" | "en-US", requestPath: string | null) => ({
  locale,
  requestPath,
  redirect: (href: string): never => {
    throw new Redirected(href);
  },
  notFound: (): never => {
    throw new NotFound();
  },
});

const principal = { type: "user", uid: "u-1" } as unknown as Extract<WebSessionGuardResult, { kind: "session" }>["principal"];
const session: WebSessionGuardResult = { kind: "session", principal, sessionId: "s-1" as Extract<WebSessionGuardResult, { kind: "session" }>["sessionId"] };

describe("signInHref", () => {
  it("sends the user back to the requested page after signing in", () => {
    expect(signInHref("pt-BR", "/pt-BR/o/a/p/b?unit=c")).toBe("/pt-BR/sign-in?next=%2Fo%2Fa%2Fp%2Fb%3Funit%3Dc");
  });

  it("omits next for home or an unknown path", () => {
    expect(signInHref("en-US", "/en-US")).toBe("/en-US/sign-in");
    expect(signInHref("en-US", null)).toBe("/en-US/sign-in");
  });
});

describe("enforceWebSession", () => {
  it("returns the session when the guard allows it", () => {
    expect(enforceWebSession(session, outcomes("pt-BR", "/pt-BR/organizations"))).toBe(session);
  });

  it("redirects to sign-in with next when there is no valid session", () => {
    const run = () => enforceWebSession({ kind: "redirect" }, outcomes("pt-BR", "/pt-BR/organizations"));

    expect(run).toThrow(new Redirected("/pt-BR/sign-in?next=%2Forganizations"));
  });
});

describe("enforceStaffSession", () => {
  const staff: StaffSessionGuardResult = { kind: "staff", principal, sessionId: session.kind === "session" ? session.sessionId : ("s" as never), role: "platform-admin" };

  it("returns the staff session", () => {
    expect(enforceStaffSession(staff, outcomes("en-US", "/en-US/admin"))).toBe(staff);
  });

  it("answers 404 (not 403) to a signed-in user who is not staff or has no MFA", () => {
    expect(() => enforceStaffSession({ kind: "not-found" }, outcomes("en-US", "/en-US/admin/users"))).toThrow(NotFound);
  });

  it("redirects to sign-in when there is no session at all", () => {
    expect(() => enforceStaffSession({ kind: "redirect" }, outcomes("en-US", "/en-US/admin"))).toThrow(new Redirected("/en-US/sign-in?next=%2Fadmin"));
  });
});
