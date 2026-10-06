import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthError, type MfaChallenge } from "#/shared/lib/auth/auth-port.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createRecordingSession, renderWithClient, TEST_USER } from "#/shared/testing/render-client.tsx";
import { MfaChallengeForm } from "./MfaChallengeForm.tsx";

const totp = { uid: "totp-1", factor: "totp" as const, displayName: null, phoneNumber: null };
const phone = { uid: "phone-1", factor: "phone" as const, displayName: null, phoneNumber: "+55 ••• 1234" };

const setup = (hints: MfaChallenge["hints"]) => {
  const challenge: MfaChallenge = { hints, handle: {} };
  const auth = createFakeAuth(TEST_USER);
  const resolved: unknown[] = [];
  auth.resolveMfa = (_challenge, answer) => {
    resolved.push(answer);
    return answer.code === "123456" ? Promise.resolve() : Promise.reject(new AuthError("INVALID_MFA_CODE"));
  };
  auth.sendMfaSmsCode = () => Promise.resolve("verification-1");
  const session = createRecordingSession({ status: "mfa-required", challenge });
  return { ...renderWithClient(<MfaChallengeForm challenge={challenge} />, { auth, session }), resolved, session };
};

describe("MfaChallengeForm", () => {
  it("verifies a TOTP code and completes the sign-in", async () => {
    const { user, resolved, session, container } = setup([totp]);
    expect(screen.getByText("Digite os 6 dígitos do seu app autenticador.")).toBeDefined();
    await user.type(screen.getByLabelText("Código de verificação"), "12a3456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(session.actions).toEqual(["completeSignIn"]));
    expect(resolved).toEqual([{ hintUid: "totp-1", code: "123456" }]);
    await expectNoAxeViolations(container);
  });

  it("marks a wrong or short code on the field and focuses it", async () => {
    const { user, container } = setup([totp]);
    const input = screen.getByLabelText("Código de verificação");
    await user.type(input, "123");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByText("O código tem 6 dígitos numéricos.")).toBeDefined();
    await user.type(input, "999");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByText("Código inválido ou expirado. Confira e tente de novo.")).toBeDefined();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    await expectNoAxeViolations(container);
  });

  it("sends an SMS code first, announces it and passes the verification id", async () => {
    const { user, resolved, session } = setup([phone]);
    expect(screen.queryByLabelText("Código de verificação")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Enviar código por SMS" }));
    expect(await screen.findByText("Enviamos um código para +55 ••• 1234.")).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Código de verificação")));
    await user.type(screen.getByLabelText("Código de verificação"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(session.actions).toEqual(["completeSignIn"]));
    expect(resolved).toEqual([{ hintUid: "phone-1", code: "123456", verificationId: "verification-1" }]);
  });

  it("lets the user pick among several factors and cancel", async () => {
    const { user, session, container } = setup([totp, phone]);
    const group = screen.getByRole("group", { name: "Como você quer confirmar?" });
    expect(group).toBeDefined();
    await user.click(screen.getByRole("radio", { name: "SMS para +55 ••• 1234" }));
    expect(screen.getByRole("button", { name: "Enviar código por SMS" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Usar outra conta" }));
    expect(session.actions).toEqual(["cancelMfa"]);
    await expectNoAxeViolations(container);
  });
});
