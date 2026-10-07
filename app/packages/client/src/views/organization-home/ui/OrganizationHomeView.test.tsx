import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { useAccessContext } from "#/entities/session/index.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeResponse, ok, page } from "#/shared/testing/fake-api.ts";
import { buildMe, buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { OrganizationHomeView } from "./OrganizationHomeView.tsx";

const PATH = `/o/${IDS.organization}`;
const renderView = (routes = shellRoutes(MEMBER_PERMISSIONS)) =>
  renderApp(
    <main>
      <OrganizationHomeView />
    </main>,
    { path: PATH, routes },
  );
const ME_WITH_DEFAULT_PROJECT = ok(
  buildMe({ lastContext: { organizationId: IDS.organization }, organizationDefaultProject: true }),
);
const defaultProjectRoutes = (projects: readonly unknown[], next: { cursor?: string } = {}) =>
  shellRoutes(MEMBER_PERMISSIONS, {
    "GET /v1/me": ME_WITH_DEFAULT_PROJECT,
    "GET /v1/organizations/:organizationId/projects": page(projects, next),
  });

/** Says when the access context the page waits for has arrived. */
function ContextLoaded() {
  const context = useAccessContext({ organizationId: IDS.organization });
  return context.isSuccess ? <span>contexto carregado</span> : null;
}

describe("OrganizationHomeView", () => {
  it("lists the projects as links and offers New project with core.project.create", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
    const list = await screen.findByRole("list", { name: "Projetos" });
    expect(within(list).getByRole("link", { name: /Beta/u }).getAttribute("href")).toBe(
      `/o/${IDS.organization}/p/${IDS.otherProject}`,
    );
    expect(screen.getByRole("button", { name: "Novo projeto" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows the empty state with the create action, or without it when not allowed", async () => {
    const allowed = renderView(
      shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/organizations/:organizationId/projects": page([]) }),
    );
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
      shellRoutes(MEMBER_PERMISSIONS, {
        "GET /v1/me/context": apiError(404, "NOT_FOUND"),
        "GET /v1/organizations/:organizationId/projects": page([]),
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("renders not-found for a hidden organization and an error with retry for the list", async () => {
    const hidden = renderView(
      shellRoutes(MEMBER_PERMISSIONS, {
        "GET /v1/me/context": apiError(404, "NOT_FOUND"),
        "GET /v1/organizations/:organizationId/projects": apiError(404, "NOT_FOUND"),
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    await expectNoAxeViolations(hidden.container);
    hidden.unmount();

    const failing = renderView(
      shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/organizations/:organizationId/projects": apiError(403, "FORBIDDEN") }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referência:");
    await waitFor(() => expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeDefined());
    await expectNoAxeViolations(failing.container);
  });

  it("opens the only visible project directly when the default project is on", async () => {
    const { router } = renderView(defaultProjectRoutes([buildProject({ id: IDS.otherProject, name: "Beta" })]));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/${IDS.otherProject}`));
    expect(router.history()).toEqual([`/o/${IDS.organization}/p/${IDS.otherProject}`]);
  });

  it("lists several projects without New project when the default project is on", async () => {
    const { container } = renderView(
      defaultProjectRoutes([buildProject(), buildProject({ id: IDS.otherProject, name: "Beta" })]),
    );
    // The list arrives after `GET /v1/me`; wait for the settled page.
    await waitFor(() => {
      expect(within(screen.getByRole("list", { name: "Projetos" })).getAllByRole("link")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Novo projeto" })).toBeNull();
    });
    await expectNoAxeViolations(container);
  });

  it("keeps the create action of the empty state when the default project is on", async () => {
    renderView(defaultProjectRoutes([]));
    expect(await screen.findByRole("heading", { name: "Nenhum projeto ainda" })).toBeDefined();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Novo projeto" })).toHaveLength(1));
  });

  it("lists a single project when another page follows, with the default project on", async () => {
    const { router } = renderView(defaultProjectRoutes([buildProject()], { cursor: "next-page" }));
    expect(await screen.findByRole("button", { name: "Carregar mais" })).toBeDefined();
    expect(within(screen.getByRole("list", { name: "Projetos" })).getAllByRole("link")).toHaveLength(1);
    expect(router.current()).toBe(PATH);
  });

  it("offers no project choice while GET /v1/me loads, then opens the only project", async () => {
    let answerMe: (response: FakeResponse) => void = () => undefined;
    const me = new Promise<FakeResponse>((resolve) => {
      answerMe = resolve;
    });
    const { router } = renderApp(
      <main>
        <OrganizationHomeView />
        <ContextLoaded />
      </main>,
      {
        path: PATH,
        routes: {
          ...defaultProjectRoutes([buildProject({ id: IDS.otherProject, name: "Beta" })]),
          "GET /v1/me": () => me,
        },
      },
    );
    expect(await screen.findByText("contexto carregado")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Novo projeto" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Projetos" })).toBeNull();
    answerMe(ME_WITH_DEFAULT_PROJECT);
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/${IDS.otherProject}`));
    expect(router.history()).toEqual([`/o/${IDS.organization}/p/${IDS.otherProject}`]);
  });
});
