import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { nextRoute, SignInView } from "./SignInView.tsx";

describe("SignInView", () => {
  it("renders the sign-in page, signs in through the bridge and goes to ?next=", async () => {
    const { user, router, bridge, container } = renderApp(<SignInView />, {
      signedIn: false,
      path: "/sign-in?next=%2Fprofile%2Fsecurity",
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Entrar" })).toBeDefined();
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByText("Core")).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Idioma" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Criar conta" })).toBeNull();
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.current()).toBe("/profile/security"));
    expect(bridge.established).toEqual([`token-${TEST_USER.uid}`]);
  });

  it("offers open sign-up only when the app enables it, keeping ?next=", async () => {
    renderApp(<SignInView />, {
      signedIn: false,
      path: "/sign-in?next=%2Forganizations",
      config: { selfServeSignUp: true },
    });
    const link = await screen.findByRole("link", { name: "Criar conta" });
    expect(link.getAttribute("href")).toBe("/sign-up?next=%2Forganizations");
  });

  it("switches to the second factor when the account has one", async () => {
    const auth = createFakeAuth(TEST_USER);
    auth.signInWithEmail = () =>
      Promise.resolve({
        kind: "mfa-required",
        challenge: { hints: [{ uid: "h1", factor: "totp", displayName: null, phoneNumber: null }], handle: {} },
      });
    const { user, container } = renderApp(<SignInView />, { signedIn: false, auth, path: "/sign-in" });
    await user.type(await screen.findByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Verificação em duas etapas" })).toBeDefined();
    expect(screen.getByLabelText("Código de verificação")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("sends a resumed session home and never follows an external or entry next", async () => {
    const { router } = renderApp(<SignInView />, { path: "/sign-in?next=%2F%2Fevil.example" });
    await waitFor(() => expect(router.current()).toBe("/"));
    expect(nextRoute("https://evil.example/x")).toEqual({ id: "home" });
    expect(nextRoute("/invite")).toEqual({ id: "home" });
    expect(nextRoute("/sign-up")).toEqual({ id: "home" });
    expect(nextRoute("/reset-password")).toEqual({ id: "home" });
    expect(nextRoute("/o/org-1")).toEqual({ id: "organization", organizationId: "org-1" });
  });
});
