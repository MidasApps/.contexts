import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildCatalogAgent } from "#/entities/agent-catalog/agent-catalog.fixture.ts";
import { buildCustomAgentOptions } from "#/entities/custom-agent/custom-agent.fixture.ts";
import { buildCustomSkill, CUSTOM_SKILL_ID } from "#/entities/custom-skill/custom-skill.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import {
  apiError,
  type FakeRequest,
  type FakeResponse,
  type FakeRoutes,
  noContent,
  ok,
  page,
} from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsSkillsView } from "./SettingsSkillsView.tsx";

const READ: Permission[] = ["core.organization.read", "core.agent-settings.read"];
const ADMIN: Permission[] = [...READ, "core.agent-settings.update"];
const SAFE = { name: "safe-actions", description: "Confirm before changing data.", source: "core" as const };

const CATALOG = [
  buildCatalogAgent({ key: "action", name: "Action", enabled: true, skills: [SAFE] }),
  buildCatalogAgent({ key: "data", name: "Data", enabled: false, skills: [SAFE] }),
  buildCatalogAgent({
    key: "example-notes",
    name: "Notes",
    source: "module",
    moduleId: "example",
    enabled: false,
    skills: [{ name: "example-notes", description: "Take notes.", source: "module" }],
  }),
];

const renderView = (permissions: readonly Permission[] = READ, routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsSkillsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/skills`,
      routes: shellRoutes(permissions, {
        "GET /v1/agents": ok(CATALOG),
        "GET /v1/agent-options": ok(buildCustomAgentOptions()),
        "GET /v1/skills": page([buildCustomSkill()]),
        ...routes,
      }),
    },
  );

// The whole app shell renders per test; under a loaded machine the defaults (1 s, 5 s) are too short.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

describe("SettingsSkillsView", { timeout: 30_000 }, () => {
  it("lists each skill once with its source, agents and whether it is in use", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Habilidades disponíveis para Northwind" });
    const safe = within(table).getByRole("row", { name: /safe-actions/u });
    expect(within(safe).getByText("Confirm before changing data.")).toBeDefined();
    expect(within(safe).getByText("Plataforma")).toBeDefined();
    expect(within(safe).getByText("Em uso")).toBeDefined();
    expect(safe.textContent).toContain("Data (desativado)");
    const notes = within(table).getByRole("row", { name: /example-notes/u });
    expect(within(notes).getByText("Módulo")).toBeDefined();
    expect(within(notes).getByText("Sem agente ativado")).toBeDefined();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 2, name: "Habilidades em uso pelos agentes" })).toBeDefined();
    expect(api.calls.find((call) => call.path === "/v1/agents")?.query).toContain(`organizationId=${IDS.organization}`);
    await expectNoAxeViolations(container);
  });

  it("lists the organization's skills and links to the agents", async () => {
    renderView(ADMIN);
    const table = await screen.findByRole("table", { name: "Habilidades criadas por Northwind" });
    const row = within(table).getByRole("row", { name: /weekly-report/u });
    expect(within(row).getByText("Ativada")).toBeDefined();
    expect(screen.getByText(/1 de 10 habilidades do plano em uso\./u)).toBeDefined();
    expect(screen.getByRole("link", { name: "Abrir agentes" }).getAttribute("href")).toBe(
      `/o/${IDS.organization}/settings/agents`,
    );
    expect(screen.queryByText(/não pode criar/u)).toBeNull();
  });

  it("creates a skill and shows the field problems first", async () => {
    const posts: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "POST /v1/skills": (request) => {
        posts.push(request);
        return ok(buildCustomSkill({ name: "release-notes" }), 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Nova habilidade" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova habilidade" });
    await user.click(within(dialog).getByRole("button", { name: "Criar habilidade" }));
    expect(await within(dialog).findByText(/Use letras minúsculas, números e hífens/u)).toBeDefined();
    expect(posts).toHaveLength(0);
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "release-notes");
    await user.type(within(dialog).getByRole("textbox", { name: "Descrição" }), "How to write release notes.");
    await user.type(within(dialog).getByRole("textbox", { name: "Instruções" }), "List the changes.");
    expect(within(dialog).getByText(/17 de 8000 caracteres\./u)).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Criar habilidade" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toEqual({
      name: "release-notes",
      description: "How to write release notes.",
      instructions: "List the changes.",
      enabled: true,
    });
    expect(posts[0]?.query.get("organizationId")).toBe(IDS.organization);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains a taken name and a reached plan limit", async () => {
    const { user, unmount } = renderView(ADMIN, { "PATCH /v1/skills/:skillId": apiError(409, "CONFLICT") });
    await user.click(await screen.findByRole("button", { name: "Editar weekly-report" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar weekly-report" });
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("Já existe uma habilidade com este nome na organização.")).toBeDefined();
    unmount();
    renderView(ADMIN, { "GET /v1/agent-options": ok(buildCustomAgentOptions({ usage: { agents: 0, skills: 10 } })) });
    expect(await screen.findByText(/O limite do plano foi atingido: exclua uma habilidade/u)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Nova habilidade" }).disabled).toBe(true);
  });

  it("disables and deletes a skill after a confirmation", async () => {
    const requests: FakeRequest[] = [];
    const record = (response: () => FakeResponse) => (request: FakeRequest) => {
      requests.push(request);
      return response();
    };
    const { user } = renderView(ADMIN, {
      "PATCH /v1/skills/:skillId": record(() => ok(buildCustomSkill({ enabled: false }))),
      "DELETE /v1/skills/:skillId": record(noContent),
    });
    await user.click(await screen.findByRole("button", { name: "Desativar weekly-report" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Desativar weekly-report?" })).getByRole("button", {
        name: "Desativar",
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({ enabled: false });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Excluir weekly-report" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Excluir weekly-report?" })).getByRole("button", {
        name: "Excluir habilidade",
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.method).toBe("DELETE");
    expect(requests[1]?.params["skillId"]).toBe(CUSTOM_SKILL_ID);
  });

  it("shows the organization's skills read-only without the update permission", async () => {
    renderView(READ);
    expect(await screen.findByRole("table", { name: "Habilidades criadas por Northwind" })).toBeDefined();
    expect(screen.getByText(/Você pode ver as habilidades, mas não pode alterá-las\./u)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Nova habilidade|Editar|Excluir|Desativar/u })).toBeNull();
  });

  it("shows an empty state, the error with a retry, and no access without the permission", async () => {
    const empty = renderView(READ, {
      "GET /v1/agents": ok([buildCatalogAgent({ skills: [] })]),
      "GET /v1/skills": page([]),
    });
    expect(await screen.findByRole("heading", { name: "Nenhuma habilidade disponível" })).toBeDefined();
    expect(await screen.findByRole("heading", { name: "Nenhuma habilidade da organização" })).toBeDefined();
    empty.unmount();
    const failed = renderView(READ, { "GET /v1/agents": apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    failed.unmount();
    renderView(["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
  });

  it("closes an untouched skill editor on Escape and asks before discarding a typed one", async () => {
    const { user } = renderView(ADMIN);
    await user.click(await screen.findByRole("button", { name: "Nova habilidade" }));
    await screen.findByRole("dialog", { name: "Nova habilidade" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Nova habilidade" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova habilidade" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "release-notes");
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await user.click(within(question).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
