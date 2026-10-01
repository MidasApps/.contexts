import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { AuthProvider, useAuth } from "./auth-context.tsx";
import { createFakeAuth } from "./fake-auth.ts";
import { useAuthState } from "./use-auth-state.ts";

const user = { uid: "u1", email: "ana@example.com", displayName: "Ana", emailVerified: true, mfaFactors: [] };

function Status() {
  const state = useAuthState();
  return <p>{state.status === "signed-in" ? `in:${state.user.uid}` : state.status}</p>;
}

describe("useAuthState", () => {
  it("follows the auth port through loading, sign-in and sign-out", async () => {
    const auth = createFakeAuth(user, { status: "loading" });
    renderWithProviders(
      <AuthProvider auth={auth}>
        <Status />
      </AuthProvider>,
    );
    expect(screen.getByText("loading")).toBeDefined();
    await act(() => auth.signInWithEmail("ana@example.com", "secret"));
    expect(screen.getByText("in:u1")).toBeDefined();
    await expect(auth.getIdToken({ forceRefresh: true })).resolves.toBe("token-u1-fresh");
    await act(() => auth.signOut());
    expect(screen.getByText("signed-out")).toBeDefined();
  });

  it("fails loudly outside AuthProvider", () => {
    const Orphan = () => <p>{typeof useAuth()}</p>;
    expect(() => renderWithProviders(<Orphan />)).toThrow(/AuthProvider/);
  });
});
