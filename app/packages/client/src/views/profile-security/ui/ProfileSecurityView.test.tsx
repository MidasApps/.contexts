import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import type { MfaFactor } from "#/shared/config/client-config.schema.ts";
import { createFakeAuth, FAKE_MFA_CODE, FAKE_TOTP_SECRET, type FakeAuthOptions } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { ProfileSecurityView } from "./ProfileSecurityView.tsx";

const renderView = (mfaFactors: MfaFactor[] = ["phone", "totp"], authOptions: FakeAuthOptions = {}) => {
  const auth = createFakeAuth(TEST_USER, { status: "signed-out" }, authOptions);
  return renderApp(
    <main>
      <ProfileSecurityView />
    </main>,
    { path: "/profile/security", auth, config: { mfaFactors } },
  );
};

const ENROLLED_SMS = {
  uid: "factor-sms",
  factor: "phone",
  displayName: "Celular",
  phoneNumber: "+5511912345678",
  enrolledAt: "2026-09-29T14:30:00.000Z",
} as const;

describe("ProfileSecurityView", () => {
  it("offers only the factors the environment supports", async () => {
    const totpOnly = renderView(["totp"]);
    expect(await screen.findByRole("heading", { name: "Nenhum segundo fator cadastrado" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Adicionar app autenticador" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Adicionar telefone" })).toBeNull();
    await expectNoAxeViolations(totpOnly.container);
    totpOnly.unmount();

    renderView(["phone"]);
    expect(await screen.findByRole("button", { name: "Adicionar telefone" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Adicionar app autenticador" })).toBeNull();
  });

  it("enrolls an authenticator app: masked setup key, wrong code as a field error, then the factor is listed", async () => {
    const { user, api } = renderView(["totp"]);
    await user.click(await screen.findByRole("button", { name: "Adicionar app autenticador" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar app autenticador" });
    const key = await within(dialog).findByRole("textbox", { name: "Chave de configuração" });
    expect((key as HTMLInputElement).value).not.toContain(FAKE_TOTP_SECRET);
    expect(within(dialog).getByRole("link", { name: "Abrir no app autenticador" }).getAttribute("href")).toMatch(
      /^otpauth:\/\/totp\//u,
    );
    await expectNoAxeViolations(dialog);

    const code = within(dialog).getByRole("textbox", { name: /Código de verificação/u });
    await user.type(code, "000000");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(await within(dialog).findByText("Código incorreto ou expirado. Tente de novo.")).toBeDefined();
    expect(document.activeElement).toBe(code);

    await user.type(code, FAKE_MFA_CODE);
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    const list = await screen.findByRole("list", { name: "Fatores cadastrados" });
    expect(within(list).getByText("App autenticador")).toBeDefined();
    expect(await screen.findByText("Verificação em duas etapas atualizada.")).toBeDefined();
    expect(api.callLines().filter((line) => line === "GET /v1/me").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the setup as a QR code to scan from the phone, listed under the product name", async () => {
    const { user, auth } = renderView(["totp"]);
    const start = vi.spyOn(auth, "startTotpEnrollment");
    await user.click(await screen.findByRole("button", { name: "Adicionar app autenticador" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar app autenticador" });
    expect(
      await within(dialog).findByRole("img", { name: "QR code para configurar o app autenticador" }),
    ).toBeDefined();
    expect(within(dialog).getByText(/Escaneie o QR code/u)).toBeDefined();
    // The authenticator lists the entry under the product name, not the Firebase project id.
    expect(start).toHaveBeenCalledWith("Core");
    // The link and the key stay as fallbacks (authenticator on this device, or no camera).
    expect(within(dialog).getByRole("link", { name: "Abrir no app autenticador" })).toBeDefined();
    expect(within(dialog).getByRole("textbox", { name: "Chave de configuração" })).toBeDefined();
    await expectNoAxeViolations(dialog);
  });

  it("never shows a setup key again after the dialog closes", async () => {
    const { user } = renderView(["totp"]);
    await user.click(await screen.findByRole("button", { name: "Adicionar app autenticador" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("textbox", { name: "Chave de configuração" });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByDisplayValue(FAKE_TOTP_SECRET)).toBeNull();
  });

  it("enrolls a phone: invalid number first, then the code sent is announced and confirms it", async () => {
    const { user } = renderView(["phone"]);
    await user.click(await screen.findByRole("button", { name: "Adicionar telefone" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar telefone" });
    const phone = within(dialog).getByRole("textbox", { name: /Número de telefone/u });
    await user.type(phone, "11912345678");
    await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
    expect(await within(dialog).findByText("Digite o número no formato internacional, começando com +.")).toBeDefined();

    await user.clear(phone);
    await user.type(phone, "+5511912345678");
    await user.click(within(dialog).getByRole("button", { name: "Enviar código" }));
    expect((await within(dialog).findByRole("status")).textContent).toBe("Código enviado para +5511912345678.");
    await user.type(within(dialog).getByRole("textbox", { name: /Código de verificação/u }), FAKE_MFA_CODE);
    await user.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    const list = await screen.findByRole("list", { name: "Fatores cadastrados" });
    expect(within(list).getByText(/\+5511912345678/u)).toBeDefined();
  });

  it("removes a factor after confirming (the last one warns that sign-in drops to the password)", async () => {
    const { user } = renderView(["phone"], { factors: [ENROLLED_SMS] });
    await user.click(await screen.findByRole("button", { name: "Remover Celular" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remover este fator?" });
    expect(within(confirm).getByText(/a entrada volta a pedir só a senha/u)).toBeDefined();
    await user.click(within(confirm).getByRole("button", { name: "Remover" }));
    expect(await screen.findByRole("heading", { name: "Nenhum segundo fator cadastrado" })).toBeDefined();
  });

  it("changes the password: client checks, wrong current password as a field error, then success", async () => {
    const { user, auth } = renderView();
    const submit = await screen.findByRole("button", { name: "Trocar senha" });
    await user.click(submit);
    const current = screen.getByLabelText("Senha atual");
    expect(current.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(current);

    await user.type(current, "wrong-password");
    await user.type(screen.getByLabelText("Nova senha"), "a-much-better-secret");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "a-much-better-secret");
    await user.click(submit);
    expect(await screen.findByText("Senha atual incorreta.")).toBeDefined();

    await user.clear(current);
    await user.type(current, "correct-password");
    await user.click(submit);
    expect(await screen.findByText("Senha alterada.")).toBeDefined();
    expect(auth.currentPassword()).toBe("a-much-better-secret");
  });

  it("asks for the second factor before changing the password when one is enrolled", async () => {
    const { user, auth, container } = renderView(["phone"], { factors: [ENROLLED_SMS] });
    const updates: string[] = [];
    const updatePassword = auth.updatePassword;
    auth.updatePassword = (next) => {
      updates.push(next);
      return updatePassword(next);
    };
    await user.type(await screen.findByLabelText("Senha atual"), "correct-password");
    await user.type(screen.getByLabelText("Nova senha"), "a-much-better-secret");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "a-much-better-secret");
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirme que é você" });
    await user.click(within(dialog).getByRole("button", { name: "Enviar código por SMS" }));
    await user.type(await within(dialog).findByRole("textbox", { name: /Código/u }), FAKE_MFA_CODE);
    await user.click(within(dialog).getByRole("button", { name: "Verificar" }));
    // Toasts are global in sonner: the previous test's may still be on screen.
    expect((await screen.findAllByText("Senha alterada.")).length).toBeGreaterThan(0);
    expect(updates).toEqual(["a-much-better-secret"]);
    await expectNoAxeViolations(container);
  });
});
