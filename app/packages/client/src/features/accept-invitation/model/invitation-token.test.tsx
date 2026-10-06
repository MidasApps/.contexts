import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readInvitationToken, useInvitationToken } from "./invitation-token.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("invitation token", () => {
  it("accepts only a well-formed token from the fragment", () => {
    expect(readInvitationToken(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(readInvitationToken(`token=${TOKEN}`)).toBe(TOKEN);
    expect(readInvitationToken("#token=too-short")).toBeNull();
    expect(readInvitationToken("")).toBeNull();
  });

  it("reads the token once and removes the fragment, keeping path and query", () => {
    window.history.replaceState(null, "", `/invite?ref=mail#token=${TOKEN}`);
    const { result, rerender } = renderHook(() => useInvitationToken());
    expect(result.current).toBe(TOKEN);
    expect(window.location.hash).toBe("");
    expect(`${window.location.pathname}${window.location.search}`).toBe("/invite?ref=mail");
    rerender();
    expect(result.current).toBe(TOKEN);
  });
});
