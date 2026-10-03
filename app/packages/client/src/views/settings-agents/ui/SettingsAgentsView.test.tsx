import type { AgentSettings, Permission, PromptVersion } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildCatalogAgent } from "#/entities/agent-catalog/agent-catalog.fixture.ts";
import { buildCustomAgent, buildCustomAgentOptions, CUSTOM_AGENT_ID } from "#/entities/custom-agent/custom-agent.fixture.ts";
import { buildCustomSkill, CUSTOM_SKILL_ID } from "#/entities/custom-skill/custom-skill.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsAgentsView } from "./SettingsAgentsView.tsx";

const READ: Permission[] = ["core.organization.read", "core.agent-settings.read"];
const ADMIN: Permission[] = [...READ, "core.agent-settings.update", "core.prompt.read", "core.prompt.write"];
const VERSION_ID = "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f";
const NEW_VERSION_ID = "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e90";

const settings = (overrides: Partial<AgentSettings> = {}): AgentSettings =>
  ({
    tenantId: IDS.organization,
    enabledAgents: ["knowledge"],
    webTools: { firecrawl: false, browser: false },
    guardrails: { pii: "warn" },
    budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
    updatedBy: null,
    createdAt: "2026-09-29T14:30:00.000Z",
    updatedAt: "2026-09-29T14:30:00.000Z",
    ...overrides,
  }) as AgentSettings;

const version = (overrides: Record<string, unknown> = {}): PromptVersion =>
  ({
    id: VERSION_ID,
    agentId: "knowledge",
    scope: "tenant",
    tenantId: IDS.organization,
    version: 1,
    body: "Answer formally.",
    bodySha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    note: "First draft",
    evalExperimentId: null,
    evalVerdict: null,
    createdBy: IDS.user,
    createdAt: "2026-09-29T14:30:00.000Z",
    ...overrides,
  }) as PromptVersion;

const CATALOG = [
  buildCatalogAgent(),
  buildCatalogAgent({
    key: "action",
    name: "Action",
    description: "Runs commands after confirmation.",
    enabled: false,
    tools: [
      { id: "command.tenancy.CreateProjectInput", kind: "mutation", source: "core" },
      { id: "issues-api.listIssues", kind: "read", source: "connector" },
    ],
    skills: [],
  }),
  buildCatalogAgent({ key: "example-notes", name: "Notes", description: "Takes notes.", source: "module", moduleId: "example", enabled: false, tools: [], skills: [] }),
];

const GUIDE = buildCatalogAgent({
  key: CUSTOM_AGENT_ID as never,
  name: "Onboarding guide",
  description: "Answers questions of new members.",
  source: "custom",
  enabled: true,
  tools: [{ id: "catalog.listEntities", kind: "read", source: "core" }],
  skills: [{ name: "org-weekly-report", description: "How to write the weekly report.", source: "custom" }],
});

const renderView = (permissions: readonly Permission[] = ADMIN, routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsAgentsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/agents`,
      routes: shellRoutes(permissions, {
        "GET /v1/agents": ok(CATALOG),
        "GET /v1/agent-settings": ok(settings()),
        "GET /v1/agent-options": ok(buildCustomAgentOptions()),
        "GET /v1/skills": page([buildCustomSkill()]),
        "GET /v1/agents/:agentId/prompt-addendum/versions": ok([]),
        "GET /v1/agents/:agentId/prompt-addendum/activations": ok([]),
        ...routes,
      }),
    },
  );

const card = async (name: string) => (await screen.findByRole("heading", { level: 3, name })).closest("article") as HTMLElement;
type User = ReturnType<typeof renderView>["user"];
/** The card with its details (instructions, tools, skills) opened: they load only then. */
const expanded = async (user: User, name: string) => {
  const article = await card(name);
  await user.click(within(article).getByRole("button", { name: `Ver detalhes de ${name}` }));
  return article;
};

// The whole app shell renders per test; under a loaded machine the defaults (1 s, 5 s) are too short.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

describe("SettingsAgentsView", { timeout: 30_000 }, () => {
  it("lists the platform agents with their tools and skills and says how the organization's agents are used", async () => {
    const { container, api, user } = renderView();
    const knowledge = await expanded(user, "Knowledge");
    expect(within(knowledge).getByText("knowledge.search")).toBeDefined();
    expect(within(knowledge).getByText("knowledge-citations")).toBeDefined();
    const action = await expanded(user, "Action");
    expect(within(action).getByText("command.tenancy.CreateProjectInput").closest("li")?.textContent).toContain("altera dados");
    // Tools read as their labels (a command as its permission); connector tools keep their own names.
    expect(within(action).getByText("Criar projetos")).toBeDefined();
    expect(within(action).getByText("issues-api.listIssues")).toBeDefined();
    expect(within(action).getByText("De conectores")).toBeDefined();
    expect(within(await card("Notes")).getByText(/^Módulo example · /u)).toBeDefined();
    expect(screen.queryByText(/Não é possível criar um novo agente aqui\./u)).toBeNull();
    expect(screen.getAllByText(/escolhido diretamente ao iniciar uma conversa; o assistente não delega/u).length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: "Nenhum agente da organização" })).toBeDefined();
    expect(screen.getByText(/1 de 5 agentes do plano em uso\./u)).toBeDefined();
    expect(api.calls.find((call) => call.path === "/v1/agents")?.query).toContain(`organizationId=${IDS.organization}`);
    await expectNoAxeViolations(container);
  });

  it("keeps each agent compact and loads its instructions only when its details open", async () => {
    const { user, api, container } = renderView();
    const knowledge = await card("Knowledge");
    expect(within(knowledge).getByText(/1 ferramenta · 1 habilidade/u)).toBeDefined();
    expect(within(knowledge).queryByText("knowledge.search")).toBeNull();
    const addendum = () => api.calls.filter((call) => call.path.includes("/prompt-addendum/"));
    expect(addendum()).toHaveLength(0);
    const toggle = within(knowledge).getByRole("button", { name: "Ver detalhes de Knowledge" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(within(knowledge).getByRole("button", { name: "Ocultar detalhes de Knowledge" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(knowledge).getByText("knowledge.search")).toBeDefined();
    await waitFor(() => expect(addendum().map((call) => call.path)).toEqual(["/v1/agents/knowledge/prompt-addendum/versions", "/v1/agents/knowledge/prompt-addendum/activations"]));
    await expectNoAxeViolations(container);
  });

  it("turns an agent on for the organization", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "PATCH /v1/agent-settings": (request) => {
        requests.push(request);
        return ok(settings({ enabledAgents: ["knowledge", "action"] }));
      },
    });
    const toggle = await screen.findByRole("switch", { name: "Ativar Action" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({ enabledAgents: ["knowledge", "action"] });
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Ativar Action" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("locks every agent switch while one change is saving, so a rollback cannot undo another", async () => {
    let finish: () => void = () => undefined;
    const { user } = renderView(ADMIN, {
      "PATCH /v1/agent-settings": () => new Promise((resolve) => (finish = () => resolve(ok(settings({ enabledAgents: ["knowledge", "action"] }))))),
    });
    await user.click(await screen.findByRole("switch", { name: "Ativar Action" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Ativar Notes" }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("switch", { name: "Ativar Action" }).hasAttribute("disabled")).toBe(true);
    finish();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Ativar Notes" }).hasAttribute("disabled")).toBe(false));
  });

  it("shows why a change was refused and puts the switch back", async () => {
    const { user } = renderView(ADMIN, { "PATCH /v1/agent-settings": apiError(403, "FORBIDDEN") });
    await user.click(await screen.findByRole("switch", { name: "Ativar Action" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível salvar");
    expect(screen.getByRole("switch", { name: "Ativar Action" }).getAttribute("aria-checked")).toBe("false");
  });

  it("changes the PII mode of the organization", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "PATCH /v1/agent-settings": (request) => {
        requests.push(request);
        return ok(settings({ guardrails: { pii: "redact" } }));
      },
    });
    await user.click(await screen.findByRole("radio", { name: "Ocultar" }));
    await waitFor(() => expect(requests[0]?.body).toEqual({ guardrails: { pii: "redact" } }));
  });

  it("shows states without switches or instructions to a viewer who can only read", async () => {
    renderView(READ);
    const action = await card("Action");
    expect(within(action).getByText("Desativado")).toBeDefined();
    expect(screen.queryByRole("switch", { name: /^Ativar /u })).toBeNull();
    expect(screen.queryByText("Instruções da organização")).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("radio", { name: "Ocultar" }).disabled).toBe(true);
  });

  it(
    "writes, evaluates and activates the organization's instructions of an agent",
    { timeout: 60_000 },
    async () => {
      let versions: PromptVersion[] = [];
      let activations: unknown[] = [];
      const posts: FakeRequest[] = [];
      const forAgent = (request: FakeRequest, rows: unknown[]) => ok(request.params["agentId"] === "knowledge" ? rows : []);
      const { user } = renderView(ADMIN, {
        "GET /v1/agents/:agentId/prompt-addendum/versions": (request) => forAgent(request, versions),
        "GET /v1/agents/:agentId/prompt-addendum/activations": (request) => forAgent(request, activations),
        "POST /v1/agents/:agentId/prompt-addendum/versions": (request) => {
          posts.push(request);
          versions = [version({ id: NEW_VERSION_ID, body: "Answer formally.", note: null })];
          return ok(versions[0], 201);
        },
        "POST /v1/agents/:agentId/prompt-addendum/versions/:versionId/eval": (request) => {
          posts.push(request);
          versions = [version({ id: NEW_VERSION_ID, note: null, evalVerdict: "passed", evalExperimentId: "exp_1" })];
          return ok({ versionId: NEW_VERSION_ID, experimentId: "exp_1", verdict: "passed", scorers: [] });
        },
        "POST /v1/agents/:agentId/prompt-addendum/activations": (request) => {
          posts.push(request);
          const activation = { id: "01927f3d-1a2b-7c3d-8e4f-5a6b7c8d9e0f", agentId: "knowledge", scope: "tenant", tenantId: IDS.organization, versionId: NEW_VERSION_ID, forced: false, reason: null, activatedBy: IDS.user, activatedAt: "2026-09-29T15:00:00.000Z" };
          activations = [activation];
          return ok(activation, 201);
        },
      });
      const knowledge = await expanded(user, "Knowledge");
      expect(await within(knowledge).findByText(/Nenhuma instrução da organização está ativa/u)).toBeDefined();
      await user.click(within(knowledge).getByRole("button", { name: "Escrever instruções para Knowledge" }));
      const dialog = await screen.findByRole("dialog", { name: "Instruções para Knowledge" });
      await user.type(within(dialog).getByRole("textbox", { name: /Instruções/u }), "Answer formally.");
      await user.click(within(dialog).getByRole("button", { name: "Salvar versão" }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]?.body).toEqual({ body: "Answer formally." });
      expect(posts[0]?.query.get("organizationId")).toBe(IDS.organization);

      const activate = await within(knowledge).findByRole("button", { name: "Ativar a versão 1 de Knowledge" });
      expect(activate).toHaveProperty("disabled", true);
      // The reason is written next to the button, not hidden in a tooltip.
      expect(within(knowledge).getByText("Avalie a versão antes de ativar.").id).toBe(activate.getAttribute("aria-describedby"));
      await user.click(within(knowledge).getByRole("button", { name: "Avaliar a versão 1 de Knowledge" }));
      await waitFor(() => expect(posts).toHaveLength(2));
      expect(posts[1]?.params["versionId"]).toBe(NEW_VERSION_ID);
      await within(knowledge).findByText("Aprovada");

      await waitFor(() => expect(within(knowledge).getByRole<HTMLButtonElement>("button", { name: "Ativar a versão 1 de Knowledge" }).disabled).toBe(false));
      await user.click(within(knowledge).getByRole("button", { name: "Ativar a versão 1 de Knowledge" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Ativar a versão 1 de Knowledge?" });
      expect(posts).toHaveLength(2);
      await user.click(within(confirm).getByRole("button", { name: "Ativar" }));
      await waitFor(() => expect(posts).toHaveLength(3));
      expect(posts[2]?.body).toEqual({ versionId: NEW_VERSION_ID });
      expect(posts[2]?.query.get("organizationId")).toBe(IDS.organization);
      expect(await within(knowledge).findByText("Versão 1 ativa")).toBeDefined();
    },
  );

  it("explains a refused activation (the evaluation is required)", async () => {
    const { user } = renderView(ADMIN, {
      "GET /v1/agents/:agentId/prompt-addendum/versions": (request) => ok(request.params["agentId"] === "knowledge" ? [version({ evalVerdict: "passed", evalExperimentId: "exp_1" })] : []),
      "POST /v1/agents/:agentId/prompt-addendum/activations": apiError(409, "EVAL_REQUIRED"),
    });
    const knowledge = await expanded(user, "Knowledge");
    await user.click(await within(knowledge).findByRole("button", { name: "Ativar a versão 1 de Knowledge" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ativar" }));
    expect((await within(knowledge).findByRole("alert")).textContent).toContain("Execute uma avaliação aprovada antes de ativar esta versão.");
  });

  it("lets a prompt reader see the instructions without the write actions", async () => {
    const { user } = renderView([...READ, "core.prompt.read"], {
      "GET /v1/agents/:agentId/prompt-addendum/versions": (request) => ok(request.params["agentId"] === "knowledge" ? [version()] : []),
    });
    const knowledge = await expanded(user, "Knowledge");
    expect(await within(knowledge).findByText("First draft")).toBeDefined();
    expect(within(knowledge).queryByRole("button", { name: /Escrever instruções/u })).toBeNull();
    expect(within(knowledge).queryByRole("button", { name: /Avaliar/u })).toBeNull();
    expect(within(await expanded(user, "Notes")).getByText("Este agente ainda não aceita instruções da organização.")).toBeDefined();
  });

  it("creates an agent of the organization with a model, tools, skills and a knowledge scope", { timeout: 60_000 }, async () => {
    const posts: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "POST /v1/agents": (request) => {
        posts.push(request);
        return ok(buildCustomAgent(), 201);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Novo agente" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo agente" });
    await user.click(await within(dialog).findByRole("button", { name: "Criar agente" }));
    expect(await within(dialog).findByText("Informe um nome com até 100 caracteres.")).toBeDefined();
    expect(within(dialog).getByText("Escreva as instruções.")).toBeDefined();
    expect(posts).toHaveLength(0);
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "Guide");
    await user.type(within(dialog).getByRole("textbox", { name: "Descrição" }), "Helps new members.");
    await user.type(within(dialog).getByRole("textbox", { name: "Instruções" }), "Be brief.");
    expect(within(dialog).getByText(/9 de 8000 caracteres\./u)).toBeDefined();
    expect(within(dialog).getByRole("checkbox", { name: /Criar projetos/u }).closest("[data-slot=field]")?.textContent).toContain("altera dados");
    await user.click(within(dialog).getByRole("checkbox", { name: /Listar os dados do catálogo/u }));
    await user.click(within(dialog).getByRole("checkbox", { name: /knowledge-citations/u }));
    await user.click(within(dialog).getByRole("checkbox", { name: /weekly-report/u }));
    await user.click(within(dialog).getByRole("switch", { name: "Ferramentas de leitura dos conectores" }));
    await user.click(within(dialog).getByRole("button", { name: "Criar agente" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toEqual({
      name: "Guide",
      description: "Helps new members.",
      instructions: "Be brief.",
      model: "chat",
      tools: ["catalog.listEntities"],
      connectorTools: true,
      coreSkills: ["knowledge-citations"],
      customSkills: [CUSTOM_SKILL_ID],
      knowledgeScope: "none",
      enabled: true,
    });
    expect(posts[0]?.query.get("organizationId")).toBe(IDS.organization);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edits an agent of the organization from its record and reports a refused save", { timeout: 60_000 }, async () => {
    const patches: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "GET /v1/agents": ok([...CATALOG, GUIDE]),
      "GET /v1/agents/:agentId": ok(buildCustomAgent({ tools: ["catalog.listEntities", "removed.tool"], knowledgeScope: "all" })),
      "PATCH /v1/agents/:agentId": (request) => {
        patches.push(request);
        return apiError(400, "VALIDATION_FAILED", [{ field: "instructions", issue: "TOO_BIG" }]);
      },
    });
    const guide = await expanded(user, "Onboarding guide");
    expect(within(guide).getByText(/^Organização/u)).toBeDefined();
    expect(within(guide).getByText("org-weekly-report")).toBeDefined();
    expect(within(guide).queryByText("Este agente ainda não aceita instruções da organização.")).toBeNull();
    await user.click(within(guide).getByRole("button", { name: "Editar Onboarding guide" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Onboarding guide" });
    const instructions = await within(dialog).findByRole<HTMLTextAreaElement>("textbox", { name: "Instruções" });
    expect(instructions.value).toBe("Answer from the handbook.");
    expect(within(dialog).getByRole("checkbox", { name: /removed\.tool/u }).getAttribute("aria-checked")).toBe("true");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]?.params["agentId"]).toBe(CUSTOM_AGENT_ID);
    expect(patches[0]?.body).toMatchObject({ name: "Onboarding guide", knowledgeScope: "all", tools: ["catalog.listEntities", "removed.tool"] });
    expect(await within(dialog).findByText("Use no máximo 8000 caracteres.")).toBeDefined();
  });

  it("disables and deletes an agent of the organization after a confirmation", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView(ADMIN, {
      "GET /v1/agents": ok([...CATALOG, GUIDE]),
      "PATCH /v1/agents/:agentId": (request) => {
        requests.push(request);
        return ok(buildCustomAgent({ enabled: false }));
      },
      "DELETE /v1/agents/:agentId": (request) => {
        requests.push(request);
        return noContent();
      },
    });
    await user.click(await screen.findByRole("button", { name: "Desativar Onboarding guide" }));
    await user.click(within(await screen.findByRole("alertdialog", { name: "Desativar Onboarding guide?" })).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({ enabled: false });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Excluir Onboarding guide" }));
    await user.click(within(await screen.findByRole("alertdialog", { name: "Excluir Onboarding guide?" })).getByRole("button", { name: "Excluir agente" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.method).toBe("DELETE");
    expect(requests[1]?.params["agentId"]).toBe(CUSTOM_AGENT_ID);
  });

  it("stops creation at the plan limit and shows the organization's agents read-only to a reader", async () => {
    const capped = renderView(ADMIN, { "GET /v1/agent-options": ok(buildCustomAgentOptions({ usage: { agents: 5, skills: 0 } })) });
    expect(await screen.findByText(/O limite do plano foi atingido: exclua um agente/u)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Novo agente" }).disabled).toBe(true);
    capped.unmount();
    renderView(READ, { "GET /v1/agents": ok([...CATALOG, GUIDE]) });
    const guide = await card("Onboarding guide");
    expect(within(guide).getByText("Ativado")).toBeDefined();
    expect(screen.getByText(/Você pode ver os agentes, mas não pode alterá-los\./u)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Novo agente|Editar Onboarding|Excluir Onboarding/u })).toBeNull();
  });

  it("shows the error of the options with a retry and keeps the platform agents", async () => {
    renderView(ADMIN, { "GET /v1/agent-options": apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    expect(await card("Knowledge")).toBeDefined();
  });

  it("shows the error with a retry when the catalog fails, and no access without the read permission", async () => {
    const failed = renderView(ADMIN, { "GET /v1/agents": apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    failed.unmount();
    renderView(["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
  });

  it("closes an untouched agent editor on Escape and asks before discarding a typed one", async () => {
    const { user } = renderView(ADMIN);
    await user.click(await screen.findByRole("button", { name: "Novo agente" }));
    await screen.findByRole("dialog", { name: "Novo agente" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Novo agente" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo agente" });
    await user.type(await within(dialog).findByRole("textbox", { name: "Nome" }), "Guide");
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await user.click(within(question).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
