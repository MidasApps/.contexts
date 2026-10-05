import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { buildMember, buildRole } from "#/shared/testing/settings-fixtures.ts";
import { SettingsMembersView } from "./SettingsMembersView.tsx";

const ADMIN: Permission[] = [
  "core.organization.read",
  "core.member.read",
  "core.member.update",
  "core.member.remove",
  "core.member.invite",
  "core.role.read",
  "core.project.read",
];
const SELF = buildMember({
  uid: IDS.user,
  displayName: "Ana Souza",
  email: "ana@example.com",
  grants: [
    {
      membershipId: "MbSelf00000000000000",
      node: { level: "organization", tenantId: IDS.organization },
      roles: [{ kind: "system", key: "owner" }],
    },
  ],
});
const BRUNO = buildMember();

const renderView = (permissions: readonly Permission[] = ADMIN, routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsMembersView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/members`,
      routes: shellRoutes(permissions, {
        "GET /v1/me": ok(buildMe()),
        "GET /v1/organizations/:organizationId/members": page([SELF, BRUNO]),
        "GET /v1/organizations/:organizationId/roles": page([buildRole()]),
        ...routes,
      }),
    },
  );

describe("SettingsMembersView", () => {
  it("lists members with their grants in a captioned table and marks the current section", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Membros" })).toBeDefined();
    await screen.findByText("bruno@example.com");
    const table = screen.getByRole("table", { name: "Membros de Northwind" });
    expect(within(table).getByText("Você")).toBeDefined();
    expect(within(table).getByText("Proprietário")).toBeDefined();
    expect(within(table).getAllByText("Toda a organização").length).toBe(2);
    const nav = screen.getByRole("navigation", { name: "Seções das configurações" });
    expect(within(nav).getByRole("link", { name: "Membros" }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);
  });

  it("changes the roles of a grant and keeps ESCALATION_FORBIDDEN in the dialog", async () => {
    const bodies: unknown[] = [];
    const { user } = renderView(ADMIN, {
      "PATCH /v1/memberships/:membershipId": (request: FakeRequest) => {
        bodies.push(request.body);
        return apiError(403, "ESCALATION_FORBIDDEN");
      },
    });
    await user.click(await screen.findByRole("button", { name: "Editar papéis de Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: "Papéis de Bruno Lima" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Administrador" }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar papéis" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Você não pode conceder permissões que não possui.");
    expect(document.activeElement).toBe(alert);
    expect(bodies).toEqual([
      {
        roles: [
          { kind: "system", key: "member" },
          { kind: "system", key: "admin" },
        ],
      },
    ]);
    await expectNoAxeViolations(dialog);
  });

  it("removes a member after confirming, and explains LAST_OWNER when the API refuses", async () => {
    const { user, api } = renderView(ADMIN, {
      "DELETE /v1/organizations/:organizationId/members/:userId": apiError(422, "LAST_OWNER"),
    });
    await user.click(await screen.findByRole("button", { name: /Remover Ana Souza/u }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remover Ana Souza da organização?" });
    await user.click(within(confirm).getByRole("button", { name: "Remover membro" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain(
      "A organização precisa de pelo menos um proprietário.",
    );
    expect(screen.getByRole("table", { hidden: true }).textContent).toContain("Ana Souza");

    api.route("DELETE /v1/organizations/:organizationId/members/:userId", noContent());
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: /Remover Bruno Lima/u }));
    api.route("GET /v1/organizations/:organizationId/members", page([SELF]));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover membro" }));
    expect(await screen.findByText("Bruno Lima foi removido da organização.")).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("cell", { name: /Bruno Lima/u })).toBeNull());
  });

  it("gives a member access at a unit of a project, and says when that access exists", async () => {
    const bodies: unknown[] = [];
    const { user } = renderView(ADMIN, {
      "POST /v1/organizations/:organizationId/memberships": (request: FakeRequest) => {
        bodies.push(request.body);
        return apiError(409, "MEMBERSHIP_EXISTS");
      },
    });
    await user.click(await screen.findByRole("button", { name: "Dar acesso a Bruno Lima em outro lugar" }));
    const dialog = await screen.findByRole("dialog", { name: "Dar acesso a Bruno Lima" });
    await user.click(within(dialog).getByRole("combobox", { name: "Onde vale" }));
    await user.click(await screen.findByRole("option", { name: "Launch" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Unidade" }));
    await user.click(await screen.findByRole("option", { name: "Site A › Floor 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Dar acesso" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("já tem acesso neste lugar");
    expect(bodies).toEqual([
      {
        userId: BRUNO["uid"],
        node: { level: "unit", tenantId: IDS.organization, projectId: IDS.project, unitId: "floor-1" },
        roles: [{ kind: "system", key: "member" }],
      },
    ]);
    await expectNoAxeViolations(dialog);
  });

  it("revokes one grant of a member who has more than one", async () => {
    const twoGrants = buildMember({
      uid: "uidCarla0000000000000",
      displayName: "Carla Dias",
      email: "carla@example.com",
      grants: [
        {
          membershipId: "MbCarlaOrg0000000000",
          node: { level: "organization", tenantId: IDS.organization },
          roles: [{ kind: "system", key: "viewer" }],
        },
        {
          membershipId: "MbCarlaProject000000",
          node: { level: "project", tenantId: IDS.organization, projectId: IDS.project },
          roles: [{ kind: "system", key: "admin" }],
        },
      ],
    });
    const { user, api } = renderView(ADMIN, {
      "GET /v1/organizations/:organizationId/members": page([SELF, BRUNO, twoGrants]),
      "DELETE /v1/memberships/:membershipId": noContent(),
    });
    await screen.findByText("carla@example.com");
    // Bruno has one grant: removing him is "Remover", not a per-grant revoke.
    expect(screen.queryByRole("button", { name: "Revogar este acesso de Bruno Lima" })).toBeNull();
    const revokes = screen.getAllByRole("button", { name: "Revogar este acesso de Carla Dias" });
    expect(revokes.length).toBe(2);
    await user.click(revokes[1] as HTMLElement);
    const confirm = await screen.findByRole("alertdialog", { name: "Revogar este acesso de Carla Dias?" });
    await user.click(within(confirm).getByRole("button", { name: "Revogar acesso" }));
    expect(await screen.findByText("Acesso de Carla Dias revogado.")).toBeDefined();
    expect(api.callLines()).toContain("DELETE /v1/memberships/MbCarlaProject000000");
  });

  it("hides every action without the permissions and shows no-access without core.member.read", async () => {
    const reader = renderView(["core.organization.read", "core.member.read"]);
    await screen.findByText("bruno@example.com");
    expect(screen.queryByRole("button", { name: /Editar papéis/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Dar acesso/u })).toBeNull();
    expect(screen.queryByRole("button", { name: "Convidar" })).toBeNull();
    reader.unmount();

    const { container, api } = renderView(["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain(`GET /v1/organizations/${IDS.organization}/members`);
    await expectNoAxeViolations(container);
  });
});
