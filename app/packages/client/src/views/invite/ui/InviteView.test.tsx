import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { apiError, ok, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { InviteView } from "./InviteView.tsx";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
const PREVIEW = { organizationName: "Northwind", inviterDisplayName: "Bia Lima", maskedEmail: "a***@example.com", expiresAt: "2026-10-06T14:30:00.000Z" };

const openLink = (hash: string) => window.history.replaceState(null, "", `/invite${hash}`);

const routes = (accept: FakeRoutes[string]): FakeRoutes => ({
  "POST /v1/invitations/preview": (request) => ((request.body as { token: string }).token === TOKEN ? ok(PREVIEW) : apiError(404, "NOT_FOUND")),
  "POST /v1/invitations/accept": accept,
});

afterEach(() => window.history.replaceState(null, "", "/"));

describe("InviteView", () => {
  it("reads the token from the fragment, clears it, previews and accepts into the organization", async () => {
    openLink(`#token=${TOKEN}`);
    const { user, router, api, container } = renderApp(<InviteView />, { path: "/invite", routes: routes(ok({ organizationId: IDS.organization })) });
    expect(window.location.hash).toBe("");
    expect(await screen.findByText("Bia Lima convidou você para participar de Northwind.")).toBeDefined();
    expect(screen.getByText("a***@example.com")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Aceitar convite" }));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}`));
    expect(api.calls.find((call) => call.path === "/v1/invitations/accept")?.body).toEqual({ token: TOKEN });
    expect(api.calls.every((call) => !call.query.includes(TOKEN))).toBe(true);
  });

  it("shows errors.EMAIL_MISMATCH with a way to use another account", async () => {
    openLink(`#token=${TOKEN}`);
    const { user, container, bridge } = renderApp(<InviteView />, { path: "/invite", routes: routes(apiError(403, "EMAIL_MISMATCH")) });
    await user.click(await screen.findByRole("button", { name: "Aceitar convite" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Este convite foi enviado para outro e-mail. Entre com a conta convidada.");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Entrar com outra conta" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Entre para ver o convite" })).toBeDefined();
    expect(bridge.ended).toBe(1);
  });

  it("asks a signed-out visitor to sign in on the page, keeping the token out of the URL", async () => {
    openLink(`#token=${TOKEN}`);
    const { user, router, container } = renderApp(<InviteView />, { signedIn: false, path: "/invite", routes: routes(ok({ organizationId: IDS.organization })) });
    expect(await screen.findByRole("heading", { level: 1, name: "Entre para ver o convite" })).toBeDefined();
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Bia Lima convidou você para participar de Northwind.")).toBeDefined();
    expect(router.current()).toBe("/invite");
  });

  it("lets an invitee without an account create one on the page, then previews and accepts", async () => {
    openLink(`#token=${TOKEN}`);
    const { user, router, auth, container } = renderApp(<InviteView />, { signedIn: false, path: "/invite", routes: routes(ok({ organizationId: IDS.organization })) });
    await user.click(await screen.findByRole("button", { name: "Criar conta" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Crie sua conta para aceitar o convite" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText(/Seu nome/u), "Caio Reis");
    await user.type(screen.getByLabelText("E-mail"), "caio@example.com");
    await user.type(screen.getByLabelText(/^Senha/u), "long-password");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("Bia Lima convidou você para participar de Northwind.")).toBeDefined();
    expect(auth.createdAccounts()).toEqual([{ email: "caio@example.com", displayName: "Caio Reis" }]);
    expect(router.current()).toBe("/invite");
    await user.click(screen.getByRole("button", { name: "Aceitar convite" }));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}`));
  });

  it("goes back to signing in from account creation", async () => {
    openLink(`#token=${TOKEN}`);
    const { user } = renderApp(<InviteView />, { signedIn: false, path: "/invite", routes: routes(ok({ organizationId: IDS.organization })) });
    await user.click(await screen.findByRole("button", { name: "Criar conta" }));
    await user.click(await screen.findByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Entre para ver o convite" })).toBeDefined();
  });

  it("keeps the token across a language switch", async () => {
    openLink(`#token=${TOKEN}`);
    const { user, router } = renderApp(<InviteView />, { signedIn: false, path: "/invite", routes: routes(ok({ organizationId: IDS.organization })) });
    const picker = await screen.findByRole("combobox", { name: "Idioma" });
    picker.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "English (United States)" }));
    expect(router.localeSwitches()).toEqual(["en-US"]);
    expect(router.localeSwitchHashes()).toEqual([`token=${TOKEN}`]);
  });

  it("explains an incomplete link and a used invitation", async () => {
    openLink("#token=short");
    const missing = renderApp(<InviteView />, { path: "/invite" });
    expect(await screen.findByRole("heading", { name: "Link de convite incompleto" })).toBeDefined();
    await expectNoAxeViolations(missing.container);
    missing.unmount();

    openLink(`#token=${TOKEN}`);
    renderApp(<InviteView />, { path: "/invite", routes: { "POST /v1/invitations/preview": apiError(409, "INVITATION_ALREADY_USED") } });
    expect(await screen.findByRole("heading", { name: "Não foi possível usar este convite" })).toBeDefined();
    expect(screen.getByText("Este convite já foi usado.")).toBeDefined();
  });
});
