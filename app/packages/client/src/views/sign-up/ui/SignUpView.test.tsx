import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { SignUpView } from "./SignUpView.tsx";

describe("SignUpView", () => {
  it("explains that accounts come from invitations when open sign-up is off", async () => {
    const { container, auth } = renderApp(<SignUpView />, { signedIn: false, path: "/sign-up" });
    expect(await screen.findByRole("heading", { name: "Contas novas só por convite" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Criar conta" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ir para Entrar" }).getAttribute("href")).toBe("/sign-in");
    expect(auth.createdAccounts()).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it("creates the account, establishes the session and goes on to ?next=", async () => {
    const { user, auth, bridge, router, container } = renderApp(<SignUpView />, { signedIn: false, path: "/sign-up?next=%2Forganizations", config: { selfServeSignUp: true } });
    expect(await screen.findByRole("heading", { level: 1, name: "Criar conta" })).toBeDefined();
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText(/Seu nome/u), "Bia Lima");
    await user.type(screen.getByLabelText("E-mail"), "bia@example.com");
    await user.type(screen.getByLabelText(/^Senha/u), "long-password");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await waitFor(() => expect(router.current()).toBe("/organizations"));
    expect(auth.createdAccounts()).toEqual([{ email: "bia@example.com", displayName: "Bia Lima" }]);
    expect(bridge.established).toHaveLength(1);
  });
});
