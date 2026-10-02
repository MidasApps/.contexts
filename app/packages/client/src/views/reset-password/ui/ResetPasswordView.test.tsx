import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ResetPasswordView } from "./ResetPasswordView.tsx";

describe("ResetPasswordView", () => {
  it("asks for the email, sends the link and leads back to sign-in", async () => {
    const { user, auth, container } = renderApp(<ResetPasswordView />, { signedIn: false, path: "/reset-password" });
    expect(await screen.findByRole("heading", { level: 1, name: "Redefinir senha" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Idioma" })).toBeDefined();
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(await screen.findByRole("heading", { name: "Confira seu e-mail" })).toBeDefined();
    expect(auth.passwordResets()).toEqual([{ email: "ana@example.com", locale: "pt-BR" }]);
    expect(screen.getByRole("link", { name: "Voltar para Entrar" }).getAttribute("href")).toBe("/sign-in");
    await expectNoAxeViolations(container);
  });
});
