import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthError } from "#/shared/lib/auth/auth-port.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient, TEST_USER } from "#/shared/testing/render-client.tsx";
import { RequestPasswordResetForm } from "./RequestPasswordResetForm.tsx";

const signedOut = () => createRecordingSession({ status: "signed-out", reason: "none" });

describe("RequestPasswordResetForm", () => {
  it("validates the email before sending anything", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { user, container } = renderWithClient(<RequestPasswordResetForm />, { auth, session: signedOut() });
    await user.type(screen.getByLabelText("E-mail"), "ana@");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(screen.getByText("Digite um e-mail válido, por exemplo nome@empresa.com.")).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText("E-mail"));
    expect(auth.passwordResets()).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it("sends the link in the UI language and confirms in neutral words, whether or not the account exists", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { user, container } = renderWithClient(<RequestPasswordResetForm />, { auth, session: signedOut(), locale: "en-US" });
    await user.type(screen.getByLabelText("Email"), " ghost@example.com ");
    await user.click(screen.getByRole("button", { name: "Send link" }));
    const heading = await screen.findByRole("heading", { name: "Check your email" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(/If an account uses ghost@example.com/u)).toBeDefined();
    expect(auth.passwordResets()).toEqual([{ email: "ghost@example.com", locale: "en-US" }]);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Use another email" }));
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("ghost@example.com");
  });

  it("shows failures the user can act on, focused", async () => {
    const auth = createFakeAuth(TEST_USER);
    auth.sendPasswordReset = () => Promise.reject(new AuthError("RATE_LIMITED"));
    const { user } = renderWithClient(<RequestPasswordResetForm />, { auth, session: signedOut() });
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
});
