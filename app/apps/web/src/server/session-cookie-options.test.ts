import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "./session-cookie-options";

describe("sessionCookieOptions", () => {
  it("is HttpOnly, Secure, SameSite=Lax on Path=/ with the session lifetime", () => {
    expect(sessionCookieOptions({ appEnv: "prod", appUrl: "https://app.example.com", maxAgeSeconds: 432_000 })).toEqual(
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 432_000,
      },
    );
  });

  it("drops Secure only for APP_ENV=local over http", () => {
    expect(sessionCookieOptions({ appEnv: "local", appUrl: "http://localhost:3100", maxAgeSeconds: 1 }).secure).toBe(
      false,
    );
    expect(sessionCookieOptions({ appEnv: "local", appUrl: "https://localhost:3100", maxAgeSeconds: 1 }).secure).toBe(
      true,
    );
    expect(
      sessionCookieOptions({ appEnv: "staging", appUrl: "http://staging.example.com", maxAgeSeconds: 1 }).secure,
    ).toBe(true);
  });
});
