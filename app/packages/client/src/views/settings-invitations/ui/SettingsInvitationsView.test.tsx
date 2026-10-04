import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildInvitation } from "#/shared/testing/settings-fixtures.ts";
import { SettingsInvitationsView } from "./SettingsInvitationsView.tsx";

const INVITER: Permission[] = [
  "core.organization.read",
  "core.member.read",
  "core.member.invite",
  "core.role.read",
  "core.project.read",
];
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
    await waitFor(() =>
      expect(
        api.calls.filter((call) => call.path.endsWith("/invitations")).some((call) => !call.query.includes("status")),
      ).toBe(true),
    );
  });

  it("shows no expiry on accepted or revoked invitations", async () => {
    renderView({
      "GET /v1/organizations/:organizationId/invitations": page([
        buildInvitation(),
        buildInvitation({
          id: "Iv2",
          email: "dora@example.com",
          status: "accepted",
          expiresAt: "2026-10-07T14:30:00.000Z",
        }),
        buildInvitation({
          id: "Iv3",
          email: "eva@example.com",
          status: "revoked",
          expiresAt: "2026-10-08T14:30:00.000Z",
        }),
      ]),
    });
    await screen.findByText("dora@example.com");
    const table = screen.getByRole("table", { name: "Convites pendentes" });
    const rowOf = (email: string) => within(table).getByText(email).closest("tr") as HTMLElement;
    expect(within(rowOf("carla@example.com")).getByText(/6 de out\. de 2026/u)).toBeDefined();
    for (const [email, day] of [
      ["dora@example.com", /7 de out\./u],
      ["eva@example.com", /8 de out\./u],
    ] as const) {
      expect(within(rowOf(email)).queryByText(day)).toBeNull();
      expect(within(rowOf(email)).getByText("Não se aplica")).toBeDefined();
    }
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
    expect(bodies[0]?.body).toEqual({
      email: "dora@example.com",
      node: { level: "organization", tenantId: IDS.organization },
      roles: [
        { kind: "system", key: "member" },
        { kind: "system", key: "viewer" },
      ],
    });
    expect(bodies[0]?.headers.get("idempotency-key")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
    await expectNoAxeViolations(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Convidar" }));
    await screen.findByRole("dialog", { name: "Convidar pessoa" });
    expect(screen.queryByDisplayValue(LOCALIZED_ACCEPT_URL)).toBeNull();
  });

  it("asks before Escape or the close button drops the one-time link", async () => {
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/invitations": ok(
        { invitation: buildInvitation({ email: "dora@example.com" }), acceptUrl: ACCEPT_URL },
        201,
      ),
    });
    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const dialog = await screen.findByRole("dialog", { name: "Convidar pessoa" });
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail" }), "dora@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    await within(dialog).findByRole("textbox", { name: "Link do convite" });
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    const question = await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" });
    await user.click(within(question).getByRole("button", { name: "Fechar mesmo assim" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks before Escape drops the link while the invitation list is still refreshing", async () => {
    let listCalls = 0;
    const { user } = renderView({
      // The refresh after the invitation never answers: the link is on screen meanwhile.
      "GET /v1/organizations/:organizationId/invitations": () =>
        ++listCalls === 1 ? page([buildInvitation()]) : new Promise(() => undefined),
      "POST /v1/organizations/:organizationId/invitations": ok(
        { invitation: buildInvitation({ email: "dora@example.com" }), acceptUrl: ACCEPT_URL },
        201,
      ),
    });
    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const dialog = await screen.findByRole("dialog", { name: "Convidar pessoa" });
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail" }), "dora@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    await within(dialog).findByRole("textbox", { name: "Link do convite" });
    await waitFor(() => expect(listCalls).toBe(2));

    expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeDefined();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog", { name: "Fechar sem guardar?" })).toBeDefined();
  });

  it("keeps ESCALATION_FORBIDDEN in the dialog with the request reference", async () => {
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/invitations": apiError(403, "ESCALATION_FORBIDDEN"),
    });
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
