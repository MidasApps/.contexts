import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminUser } from "#/shared/testing/admin-accounts-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminTeamView } from "./AdminTeamView.tsx";

const AT = "2026-10-01T12:00:00.000Z";
const SELF = { uid: IDS.user, role: "platform-admin", isActive: true, createdAt: AT, updatedAt: AT };
const BRUNO = { uid: "uBruno00000000000000", role: "platform-support", isActive: true, createdAt: AT, updatedAt: AT };
const CARLA = { uid: "uCarla00000000000000", role: "platform-support", isActive: false, createdAt: AT, updatedAt: AT };

const routes = (extra: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/staff": ok([SELF, BRUNO, CARLA]),
  "GET /v1/admin/users": (request: FakeRequest) =>
    request.query.get("ids") === null
      ? page(
          request.query.get("query") === "dora@example.com"
            ? [buildAdminUser({ id: "uDora000000000000000", email: "dora@example.com", displayName: "Dora" })]
            : [],
        )
      : page([
          buildAdminUser({ id: BRUNO.uid, email: "bruno@example.com", displayName: "Bruno Lima" }),
          buildAdminUser({ id: CARLA.uid, email: "carla@example.com", displayName: "Carla Dias" }),
        ]),
  ...extra,
});

vi.setConfig({ testTimeout: 20_000 });

describe("AdminTeamView", () => {
  it("lists the team with roles and status, and no actions on one's own row", async () => {
    const { container } = renderAdmin(<AdminTeamView />, { path: "/admin/team", routes: routes() });
    const table = await screen.findByRole("table", { name: "Equipe da plataforma" });
    await within(table).findByText("Bruno Lima");
    expect(within(table).getByText("Você")).toBeDefined();
    expect(within(table).getAllByText("Suporte da plataforma").length).toBe(2);
    expect(within(table).getByText("Revogado")).toBeDefined();
    expect(within(table).getByRole("button", { name: "Devolver o acesso de Carla Dias" })).toBeDefined();
    expect(within(table).queryByRole("button", { name: /Revogar o acesso de Carla/u })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("adds a person by the exact email of their account, with the chosen role", async () => {
    const puts: unknown[] = [];
    const { user } = renderAdmin(<AdminTeamView />, {
      path: "/admin/team",
      routes: routes({
        "PUT /v1/admin/staff/:userId": (request: FakeRequest) => {
          puts.push([request.params["userId"], request.body]);
          return ok({ ...BRUNO, uid: request.params["userId"] });
        },
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Adicionar à equipe" }));
    const dialog = await screen.findByRole("dialog", { name: "Adicionar à equipe" });
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail da conta" }), "nobody@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(await within(dialog).findByText(/Nenhuma conta usa este e-mail/u)).toBeDefined();
    await user.clear(within(dialog).getByRole("textbox", { name: "E-mail da conta" }));
    await user.type(within(dialog).getByRole("textbox", { name: "E-mail da conta" }), "Dora@example.com");
    await user.click(within(dialog).getByRole("radio", { name: /Administrador da plataforma/u }));
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([["uDora000000000000000", { role: "platform-admin" }]]);
  });

  it("revokes after confirming, and explains STAFF_SELF_CHANGE", async () => {
    const { user, api } = renderAdmin(<AdminTeamView />, {
      path: "/admin/team",
      routes: routes({ "DELETE /v1/admin/staff/:userId": apiError(422, "STAFF_SELF_CHANGE") }),
    });
    await user.click(await screen.findByRole("button", { name: "Revogar o acesso de Bruno Lima" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Revogar o acesso de Bruno Lima?" });
    await user.click(within(confirm).getByRole("button", { name: "Revogar acesso" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain("seu próprio acesso");
    api.route("DELETE /v1/admin/staff/:userId", noContent());
    await user.click(within(confirm).getByRole("button", { name: "Revogar acesso" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`DELETE /v1/admin/staff/${BRUNO.uid}`);
  });

  it("is closed to the support role", async () => {
    const { api } = renderAdmin(<AdminTeamView />, { path: "/admin/team", role: "platform-support", routes: routes() });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/staff");
  });
});
