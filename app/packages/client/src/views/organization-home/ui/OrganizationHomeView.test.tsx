import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, page } from "#/shared/testing/fake-api.ts";
import { buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { OrganizationHomeView } from "./OrganizationHomeView.tsx";

const PATH = `/o/${IDS.organization}`;
const renderView = (routes = shellRoutes(MEMBER_PERMISSIONS)) =>
  renderApp(
    <main>
      <OrganizationHomeView />
    </main>,
    { path: PATH, routes },
  );

describe("OrganizationHomeView", () => {
  it("lists the projects as links and offers New project with core.project.create", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
    const list = await screen.findByRole("list", { name: "Projetos" });
    expect(within(list).getByRole("link", { name: /Beta/u }).getAttribute("href")).toBe(`/o/${IDS.organization}/p/${IDS.otherProject}`);
    expect(screen.getByRole("button", { name: "Novo projeto" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows the empty state with the create action, or without it when not allowed", async () => {
    const allowed = renderView(shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/organizations/:organizationId/projects": page([]) }));
    expect(await screen.findByRole("heading", { name: "Nenhum projeto ainda" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Novo projeto" })).toHaveLength(2);
    await expectNoAxeViolations(allowed.container);
    allowed.unmount();

    renderView(shellRoutes(["core.organization.read"], { "GET /v1/organizations/:organizationId/projects": page([]) }));
    expect(await screen.findByText(/Peça acesso a quem administra a organização/u)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Novo projeto" })).toBeNull();
  });

  it("takes a project-only member to their first visible project (decision 0030 A5)", async () => {
    const { router } = renderView(
      shellRoutes(MEMBER_PERMISSIONS, {
        "GET /v1/me/context": apiError(404, "NOT_FOUND"),
        "GET /v1/organizations/:organizationId/projects": page([buildProject({ id: IDS.otherProject, name: "Beta" })]),
      }),
    );
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/${IDS.otherProject}`));
    expect(router.history()).toEqual([`/o/${IDS.organization}/p/${IDS.otherProject}`]);
  });

  it("renders not-found when the organization context is hidden and no project is visible", async () => {
    const { container } = renderView(
      shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/me/context": apiError(404, "NOT_FOUND"), "GET /v1/organizations/:organizationId/projects": page([]) }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("renders not-found for a hidden organization and an error with retry for the list", async () => {
    const hidden = renderView(
      shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/me/context": apiError(404, "NOT_FOUND"), "GET /v1/organizations/:organizationId/projects": apiError(404, "NOT_FOUND") }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    await expectNoAxeViolations(hidden.container);
    hidden.unmount();

    const failing = renderView(shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/organizations/:organizationId/projects": apiError(403, "FORBIDDEN") }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referência:");
    await waitFor(() => expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeDefined());
    await expectNoAxeViolations(failing.container);
  });
});
