import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildInvitation } from "#/shared/testing/settings-fixtures.ts";
import { SettingsInvitationsView } from "./SettingsInvitationsView.tsx";

const INVITER: Permission[] = ["core.organization.read", "core.member.read", "core.member.invite", "core.role.read", "core.project.read"];
const ACCEPT_URL = "https://app.example.com/invite#token=Zx9Cv8Bn7Mm6Aa5Ss4Dd3Ff2Gg1Hh0Jj9Kk8Ll7Qq6W";
// The dialog shows the link in the inviter's UI locale (pt-BR here).
const LOCALIZED_ACCEPT_URL = "https://app.example.com/pt-BR/invite#token=Zx9Cv8Bn7Mm6Aa5Ss4Dd3Ff2Gg1Hh0Jj9Kk8Ll7Qq6W";

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = INVITER) =>
  renderApp(
    <main>
      <SettingsInvitationsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/invitations`,
      routes: shellRoutes(permissions, {
        "GET /v1/organizations/:organizationId/invitations": page([buildInvitation()]),
        "GET /v1/organizations/:organizationId/roles": page([]),
        ...routes,
      }),
    },
  );

describe("SettingsInvitationsView", () => {
  it("lists pending invitations with status and expiry, and filters all", async () => {
    const { user, container, api } = renderView();
    await screen.findByText("carla@example.com");
    expect(screen.getByRole("table", { name: "Convites pendentes" })).toBeDefined();
    expect(screen.getByText("Pendente")).toBeDefined();
    expect(api.calls.find((call) => call.path.endsWith("/invitations"))?.query).toContain("status=pending");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("tab", { name: "Todos" }));
    await waitFor(() => expect(api.calls.filter((call) => call.path.endsWith("/invitations")).some((call) => !call.query.includes("status"))).toBe(true));
  });

  it("invites with node and roles, shows the link once, and never again after closing", async () => {
    const bodies: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/invitations": (request: FakeRequest) => {
        bodies.push(request);
        return ok({ invitation: buildInvitation({ email: "dora@example.com" }), acceptUrl: ACCEPT_URL }, 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const dialog = await screen.findByRole("dialog", { name: "Convidar pessoa" });
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    expect(await within(dialog).findByText("Digite o e-mail da pessoa.")).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail" }), "dora@example.com");
    await user.click(within(dialog).getByRole("checkbox", { name: "Leitor" }));
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    const link = await within(dialog).findByRole("textbox", { name: "Link do convite" });
    expect((link as HTMLInputElement).value).toBe(LOCALIZED_ACCEPT_URL);
    expect(bodies[0]?.body).toEqual({ email: "dora@example.com", node: { level: "organization", tenantId: IDS.organization }, roles: [{ kind: "system", key: "member" }, { kind: "system", key: "viewer" }] });
    expect(bodies[0]?.headers.get("idempotency-key")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
    await expectNoAxeViolations(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Convidar" }));
    await screen.findByRole("dialog", { name: "Convidar pessoa" });
    expect(screen.queryByDisplayValue(LOCALIZED_ACCEPT_URL)).toBeNull();
  });

  it("keeps ESCALATION_FORBIDDEN in the dialog with the request reference", async () => {
    const { user } = renderView({ "POST /v1/organizations/:organizationId/invitations": apiError(403, "ESCALATION_FORBIDDEN") });
    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail" }), "dora@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Você não pode conceder permissões que não possui.");
    expect(alert.textContent).toContain("01K6FAKEREQ0000000000000000");
  });

  it("revokes a pending invitation after confirming", async () => {
    const { user, api } = renderView({ "DELETE /v1/invitations/:invitationId": noContent() });
    await user.click(await screen.findByRole("button", { name: "Revogar convite de carla@example.com" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Revogar este convite?" });
    api.route("GET /v1/organizations/:organizationId/invitations", page([]));
    await user.click(within(confirm).getByRole("button", { name: "Revogar convite" }));
    expect(await screen.findByText("Convite de carla@example.com revogado.")).toBeDefined();
    expect(await screen.findByRole("heading", { name: "Nenhum convite pendente" })).toBeDefined();
    expect(api.callLines()).toContain("DELETE /v1/invitations/Iv7cX9zA1sD3fG5hJ7kL");
  });
});
