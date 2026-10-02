import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthError, type MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient, TEST_USER } from "#/shared/testing/render-client.tsx";
import { validateCredentials } from "../model/validate-credentials.ts";
import { SignInForm } from "./SignInForm.tsx";

const signedOut = () => createRecordingSession({ status: "signed-out", reason: "none" });

const fillAndSubmit = async (user: ReturnType<typeof renderWithClient>["user"], email: string, password: string) => {
  if (email !== "") await user.type(screen.getByLabelText("E-mail"), email);
  if (password !== "") await user.type(screen.getByLabelText("Senha"), password);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
};

describe("SignInForm", () => {
  it("validates presence and email shape before calling Firebase, focusing the first problem", async () => {
    const auth = createFakeAuth(TEST_USER);
    const calls: string[] = [];
    auth.signInWithEmail = (email) => {
      calls.push(email);
      return Promise.resolve({ kind: "signed-in" });
    };
    const { user, container } = renderWithClient(<SignInForm />, { auth, session: signedOut() });
    await fillAndSubmit(user, "", "");
    const email = screen.getByLabelText("E-mail");
    expect(document.activeElement).toBe(email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Informe seu e-mail.")).toBeDefined();
    expect(screen.getByText("Informe sua senha.")).toBeDefined();
    expect(calls).toEqual([]);
    await expectNoAxeViolations(container);
    expect(validateCredentials({ email: "ana@", password: "x" })).toEqual({ email: "emailInvalid" });
  });

  it("links to the password reset page", () => {
    renderWithClient(<SignInForm />, { session: signedOut() });
    expect(screen.getByRole("link", { name: "Esqueci minha senha" }).getAttribute("href")).toBe("/reset-password");
  });

  it("signs in and completes the session through the bridge", async () => {
    const session = signedOut();
    const { user } = renderWithClient(<SignInForm />, { session, auth: createFakeAuth(TEST_USER) });
    await fillAndSubmit(user, "  ana@example.com ", "s3cret-pass");
    await waitFor(() => expect(session.actions).toEqual(["completeSignIn"]));
  });

  it("shows one generic message for wrong credentials, never pointing at a field, and clears the password", async () => {
    const auth = createFakeAuth(TEST_USER);
    auth.signInWithEmail = () => Promise.reject(new AuthError("INVALID_CREDENTIALS"));
    const { user, container } = renderWithClient(<SignInForm />, { auth, session: signedOut() });
    await fillAndSubmit(user, "ana@example.com", "wrong-pass");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("E-mail ou senha incorretos. Confira os dados e tente novamente.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.getByLabelText("E-mail").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByLabelText("Senha").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Senha").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("E-mail").value).toBe("ana@example.com");
    await expectNoAxeViolations(container);
  });

  it("hands an MFA challenge to the session instead of completing the sign-in", async () => {
    const challenge: MfaChallenge = { hints: [{ uid: "h1", factor: "totp", displayName: null, phoneNumber: null }], handle: {} };
    const auth = createFakeAuth(TEST_USER);
    auth.signInWithEmail = () => Promise.resolve({ kind: "mfa-required", challenge });
    const session = signedOut();
    const { user } = renderWithClient(<SignInForm />, { auth, session });
    await fillAndSubmit(user, "ana@example.com", "s3cret-pass");
    await waitFor(() => expect(session.actions).toEqual(["requireMfa"]));
  });

  it("toggles the password visibility with a pressed state and maps unexpected failures to a generic error", async () => {
    const auth = createFakeAuth(TEST_USER);
    auth.signInWithEmail = () => Promise.reject(new Error("auth/internal-error: stack trace"));
    const { user } = renderWithClient(<SignInForm />, { auth, session: signedOut(), locale: "en-US" });
    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't sign you in right now. Try again in a moment.");
  });
});
