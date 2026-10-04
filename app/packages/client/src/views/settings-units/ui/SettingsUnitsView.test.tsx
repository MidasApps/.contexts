import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { buildUnit, IDS } from "#/shared/testing/fixtures.ts";
import { UNIT_TYPES } from "#/shared/testing/settings-fixtures.ts";
import { SettingsUnitsView } from "./SettingsUnitsView.tsx";

const UNIT_ADMIN: Permission[] = [
  "core.organization.read",
  "core.project.read",
  "core.unit.read",
  "core.unit.create",
  "core.unit.update",
  "core.unit.delete",
];
const SITE_A = buildUnit({ id: "site-1", name: "Site A", type: "sample.site" });
const SITE_B = buildUnit({ id: "site-2", name: "Site B", type: "sample.site" });
const FLOOR = buildUnit({ id: "floor-1", name: "Floor 2", type: "sample.room", ancestorIds: ["site-1"] });

const unitsRoute = (request: FakeRequest) => {
  const parent = request.query.get("parentUnitId");
  if (parent === null) return page([SITE_A, SITE_B]);
  return page(parent === "site-1" ? [FLOOR] : []);
};

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = UNIT_ADMIN) =>
  renderApp(
    <main>
      <SettingsUnitsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/units`,
      routes: shellRoutes(permissions, {
        "GET /v1/unit-types": page(UNIT_TYPES),
        "GET /v1/projects/:projectId/units": unitsRoute,
        ...routes,
      }),
    },
  );

const selectUnit = async (user: ReturnType<typeof renderView>["user"], name: string) => {
  const tree = await screen.findByRole("tree", { name: "Unidades de Launch" });
  await user.click(within(tree).getByRole("treeitem", { name }));
};

describe("SettingsUnitsView", () => {
  it("shows the project's unit tree and a project picker", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("tree", { name: "Unidades de Launch" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Projeto" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates a sub-unit with the only type the parent allows", async () => {
    const bodies: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/projects/:projectId/units": (request: FakeRequest) => {
        bodies.push(request);
        return ok(buildUnit({ id: "room-9", name: "Room 9", ancestorIds: ["site-2"] }), 201);
      },
    });
    await selectUnit(user, "Site B");
    await user.click(screen.getByRole("button", { name: "Nova subunidade" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova unidade" });
    expect(within(dialog).getByText("A unidade fica dentro de Site B.")).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "Room 9");
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Criar unidade" }));
    expect(await screen.findByText("Unidade Room 9 criada.")).toBeDefined();
    expect(bodies[0]?.body).toEqual({ name: "Room 9", type: "sample.room", parentUnitId: "site-2" });
  });

  it('moves a unit through the "Move to…" dialog and keeps INVALID_UNIT_PARENT in it', async () => {
    const { user, api } = renderView({ "PATCH /v1/units/:unitId": apiError(422, "INVALID_UNIT_PARENT") });
    const tree = await screen.findByRole("tree", { name: "Unidades de Launch" });
    within(tree).getByRole("treeitem", { name: "Site A" }).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await within(tree).findByRole("treeitem", { name: "Floor 2" }));
    await user.click(screen.getByRole("button", { name: "Mover para…" }));
    const dialog = await screen.findByRole("dialog", { name: "Mover Floor 2" });
    await user.click(within(dialog).getByRole("combobox", { name: "Destino" }));
    await user.click(await screen.findByRole("option", { name: "Site B" }));
    await user.click(within(dialog).getByRole("button", { name: "Mover" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Esta unidade não pode ficar dentro da unidade escolhida.",
    );
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ parentUnitId: "site-2" });
  });

  it("deletes a unit after confirming, saying how many sub-units go with it", async () => {
    const { user, api } = renderView({ "DELETE /v1/units/:unitId": noContent() });
    await selectUnit(user, "Site A");
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir Site A?" });
    expect(within(confirm).getByText(/A unidade e 1 subunidade serão excluídas/u)).toBeDefined();
    await user.click(within(confirm).getByRole("button", { name: "Excluir unidade" }));
    expect(await screen.findByText("Unidade Site A excluída.")).toBeDefined();
    expect(api.callLines()).toContain("DELETE /v1/units/site-1");
  });

  it("does not offer a sub-unit under a type that allows none, and says why", async () => {
    const room = buildUnit({ id: "room-1", name: "Room 1", type: "sample.room" });
    const { user, container } = renderView({
      "GET /v1/projects/:projectId/units": (request: FakeRequest) =>
        page(request.query.get("parentUnitId") === null ? [SITE_A, room] : []),
    });
    await selectUnit(user, "Room 1");
    const create = screen.getByRole("button", { name: "Nova subunidade" });
    expect(create.hasAttribute("disabled")).toBe(true);
    const reason = document.getElementById(create.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Este tipo de unidade não aceita subunidades.");
    await expectNoAxeViolations(container);
    await selectUnit(user, "Site A");
    expect(screen.getByRole("button", { name: "Nova subunidade" }).hasAttribute("disabled")).toBe(false);
  });

  it("offers the first unit when the project has none, and hides writes without permission", async () => {
    const empty = renderView({ "GET /v1/projects/:projectId/units": page([]) });
    expect(await screen.findByRole("heading", { name: "Nenhuma unidade ainda" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Nova unidade" }).length).toBe(2);
    await expectNoAxeViolations(empty.container);
    empty.unmount();

    const { user } = renderView({}, ["core.organization.read", "core.project.read", "core.unit.read"]);
    await selectUnit(user, "Site A");
    expect(screen.queryByRole("button", { name: "Nova subunidade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Renomear" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull());
  });

  it("asks for a project first when the organization has none", async () => {
    renderView({ "GET /v1/organizations/:organizationId/projects": page([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum projeto ainda" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver projetos" }).getAttribute("href")).toBe(`/o/${IDS.organization}`);
  });
});
