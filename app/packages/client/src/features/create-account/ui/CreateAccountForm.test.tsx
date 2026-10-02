import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient, TEST_USER } from "#/shared/testing/render-client.tsx";
import { validateNewAccount } from "../model/validate-new-account.ts";
import { CreateAccountForm } from "./CreateAccountForm.tsx";

const signedOut = () => createRecordingSession({ status: "signed-out", reason: "none" });

const fill = async (user: ReturnType<typeof renderWithClient>["user"], values: { name?: string; email?: string; password?: string }) => {
  if (values.name !== undefined) await user.type(screen.getByLabelText(/Seu nome/u), values.name);
  if (values.email !== undefined) await user.type(screen.getByLabelText("E-mail"), values.email);
  if (values.password !== undefined) await user.type(screen.getByLabelText(/^Senha/u), values.password);
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
};

describe("CreateAccountForm", () => {
  it("checks name, email and password length before calling Firebase, focusing the first problem", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { user, container } = renderWithClient(<CreateAccountForm />, { auth, session: signedOut() });
    await fill(user, { email: "ana@", password: "short" });
    expect(document.activeElement).toBe(screen.getByLabelText(/Seu nome/u));
    expect(screen.getByText("Informe seu nome.")).toBeDefined();
    expect(screen.getByText("Digite um e-mail válido, por exemplo nome@empresa.com.")).toBeDefined();
    expect(screen.getByText("Use pelo menos 8 caracteres.")).toBeDefined();
    expect(auth.createdAccounts()).toEqual([]);
    await expectNoAxeViolations(container);
    expect(validateNewAccount({ name: " ", email: "", password: "" })).toEqual({ name: "nameRequired", email: "emailRequired", password: "passwordRequired" });
  });

  it("creates the account with the trimmed email and name, then completes the session", async () => {
    const auth = createFakeAuth(TEST_USER);
    const session = signedOut();
    const { user } = renderWithClient(<CreateAccountForm />, { auth, session });
    await fill(user, { name: " Bia Lima ", email: " bia@example.com ", password: "long-password" });
    await waitFor(() => expect(session.actions).toEqual(["completeSignIn"]));
    expect(auth.createdAccounts()).toEqual([{ email: "bia@example.com", displayName: "Bia Lima" }]);
  });

  it("says when the email already has an account and keeps what was typed except the password", async () => {
    const auth = createFakeAuth(TEST_USER, { status: "signed-out" }, { takenEmails: ["bia@example.com"] });
    const { user, container } = renderWithClient(<CreateAccountForm />, { auth, session: signedOut() });
    await fill(user, { name: "Bia", email: "bia@example.com", password: "long-password" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Já existe uma conta com este e-mail.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.getByLabelText<HTMLInputElement>("E-mail").value).toBe("bia@example.com");
    expect(screen.getByLabelText<HTMLInputElement>(/^Senha/u).value).toBe("");
    await expectNoAxeViolations(container);
  });
});
