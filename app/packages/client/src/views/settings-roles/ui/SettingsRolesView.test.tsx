import type { Permission } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildRole, PERMISSION_REGISTRY } from "#/shared/testing/settings-fixtures.ts";
import { SettingsRolesView } from "./SettingsRolesView.tsx";

const ROLE_ADMIN: Permission[] = ["core.organization.read", "core.role.read", "core.role.create", "core.role.update", "core.role.delete", "core.project.read", "core.unit.read"];

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = ROLE_ADMIN) =>
  renderApp(
    <main>
      <SettingsRolesView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/roles`,
      routes: shellRoutes(permissions, { "GET /v1/organizations/:organizationId/roles": page([buildRole()]), "GET /v1/permissions": page(PERMISSION_REGISTRY), ...routes }),
    },
  );

describe("SettingsRolesView", () => {
  it("lists custom roles and the system roles", async () => {
    const { container } = renderView();
    await screen.findByText("Project editor");
    expect(screen.getByRole("table", { name: "Papéis personalizados da organização" }).textContent).toContain("2 permissões");
    expect(screen.getByText("Administrador")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates a role with the permission picker grouped by module, disabling what the actor lacks", async () => {
    const bodies: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/organizations/:organizationId/roles": (request: FakeRequest) => {
        bodies.push(request);
        return ok(buildRole({ id: "RlNew000000000000000", name: "Auditor", permissions: ["core.unit.read"] }), 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Novo papel" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo papel" });
    expect(within(dialog).getByRole("group", { name: /Plataforma/u })).toBeDefined();
    expect(within(dialog).getByRole("checkbox", { name: /Ver membros/u }).hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Criar papel" }));
    expect(await within(dialog).findByText("Dê um nome ao papel.")).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "Auditor");
    await user.click(within(dialog).getByRole("checkbox", { name: /Ver unidades/u }));
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Criar papel" }));
    expect(await screen.findByText("Papel Auditor criado.")).toBeDefined();
    expect(bodies[0]?.body).toEqual({ name: "Auditor", description: "", permissions: ["core.unit.read"] });
    expect(bodies[0]?.headers.get("idempotency-key")).not.toBeNull();
  });

  it("edits only the changed fields", async () => {
    const bodies: unknown[] = [];
    const { user } = renderView({
      "PATCH /v1/roles/:roleId": (request: FakeRequest) => {
        bodies.push(request.body);
        return ok(buildRole({ name: "Project editors" }));
      },
    });
    await user.click(await screen.findByRole("button", { name: "Editar papel Project editor" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Project editor" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "s");
    await user.click(within(dialog).getByRole("button", { name: "Salvar papel" }));
    await waitFor(() => expect(bodies).toEqual([{ name: "Project editors" }]));
  });

  it("explains ROLE_IN_USE when deleting a role still granted", async () => {
    const { user } = renderView({ "DELETE /v1/roles/:roleId": apiError(409, "ROLE_IN_USE") });
    await user.click(await screen.findByRole("button", { name: "Excluir papel Project editor" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir o papel Project editor?" });
    await user.click(within(confirm).getByRole("button", { name: "Excluir papel" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain("Este papel ainda está atribuído a membros.");
  });

  it("explains a failed permission catalog inside the editor and recovers on retry", async () => {
    let catalogUp = false;
    const { user } = renderView({
      "GET /v1/permissions": () => (catalogUp ? page(PERMISSION_REGISTRY) : apiError(429, "RATE_LIMITED")),
    });
    const edit = await screen.findByRole("button", { name: "Editar papel Project editor" });
    await waitFor(() => expect(edit.hasAttribute("disabled")).toBe(false));
    await user.click(edit);
    const dialog = await screen.findByRole("dialog", { name: "Editar Project editor" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Muitas tentativas");
    expect(alert.textContent).toContain("Não foi possível carregar as permissões");
    expect(within(dialog).getByRole("button", { name: "Salvar papel" }).hasAttribute("disabled")).toBe(true);
    await expectNoAxeViolations(dialog);
    catalogUp = true;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(dialog).findByRole("checkbox", { name: /Ver unidades/u })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Salvar papel" }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps every create and edit entry point waiting while the permission catalog loads", async () => {
    renderView({ "GET /v1/permissions": () => new Promise(() => undefined), "GET /v1/organizations/:organizationId/roles": page([]) });
    await screen.findByText("Nenhum papel personalizado");
    const create = screen.getAllByRole("button", { name: "Novo papel" });
    expect(create.length).toBe(2);
    for (const button of create) expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("disables row edits while the permission catalog loads", async () => {
    renderView({ "GET /v1/permissions": () => new Promise(() => undefined) });
    expect((await screen.findByRole("button", { name: "Editar papel Project editor" })).hasAttribute("disabled")).toBe(true);
  });

  it("offers no create/edit/delete without the write permissions", async () => {
    renderView({}, ["core.organization.read", "core.role.read"]);
    await screen.findByText("Project editor");
    expect(screen.queryByRole("button", { name: "Novo papel" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar papel/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir papel/u })).toBeNull();
  });

  it("closes an untouched role editor on Escape and asks before discarding a typed one", async () => {
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Novo papel" }));
    await screen.findByRole("dialog", { name: "Novo papel" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Novo papel" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo papel" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "Auditor");
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await user.click(within(question).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
