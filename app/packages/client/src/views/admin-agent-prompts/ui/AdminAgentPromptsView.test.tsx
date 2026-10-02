import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminUser } from "#/shared/testing/admin-accounts-fixtures.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildPromptActivation, buildPromptEvalResult, buildPromptVersion, PROMPT_IDS } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { AdminAgentPromptsView } from "./AdminAgentPromptsView.tsx";

const BASE = "/v1/admin/agents/:agentId";
const PATH = "/admin/agents/assistant/prompts";

// v3 not evaluated (newest), v2 active with a passing eval, v1 older with a passing eval.
const V3 = buildPromptVersion({ id: PROMPT_IDS.v3, version: 3, body: "You are the assistant.\nBe concise.\nCite sources.\nAnswer in the user's language.", note: "Tom mais direto." });
const V2 = buildPromptVersion({ id: PROMPT_IDS.v2, version: 2, evalVerdict: "passed", evalExperimentId: "exp_2" });
const V1 = buildPromptVersion({ id: PROMPT_IDS.v1, version: 1, body: "You are the assistant.", evalVerdict: "passed", evalExperimentId: "exp_1" });
const ACTIVATIONS = [
  buildPromptActivation({ id: PROMPT_IDS.activation2, versionId: PROMPT_IDS.v2, activatedAt: "2026-09-30T15:00:00.000Z" }),
  buildPromptActivation({ id: PROMPT_IDS.activation1, versionId: PROMPT_IDS.v1, forced: true, reason: "Seed importado; o CI avalia." }),
];

const routes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  [`GET ${BASE}/prompt-versions`]: ok([V3, V2, V1]),
  [`GET ${BASE}/activations`]: ok(ACTIVATIONS),
  ...overrides,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminAgentPromptsView />, { path: PATH, routes: routes(), ...options });

const versionsTable = async (): Promise<HTMLElement> => screen.findByRole("table", { name: "Versões do prompt de Assistente" });
const row = (table: HTMLElement, version: string): HTMLElement => within(table).getByRole("row", { name: new RegExp(`^${version}(?!\\d)`, "u") });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("AdminAgentPromptsView", () => {
  it("lists the versions newest first with verdict, the active one and the activation history", async () => {
    const { container } = render();
    const table = await versionsTable();
    expect(screen.getByRole("heading", { level: 1, name: "Prompts de Assistente" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Agentes e prompts" }).getAttribute("href")).toBe("/admin/agents");
    expect(within(table).getAllByRole("row").slice(1).map((line) => line.textContent?.slice(0, 2))).toEqual(["v3", "v2", "v1"]);
    expect(within(row(table, "v3")).getByText("Não avaliada")).toBeDefined();
    expect(within(row(table, "v3")).getByText("Tom mais direto.")).toBeDefined();
    expect(within(row(table, "v2")).getByText("Ativa")).toBeDefined();
    expect(within(row(table, "v2")).getByText("Aprovada")).toBeDefined();
    expect(screen.getByText("A versão 2 está em produção.")).toBeDefined();
    const history = screen.getByRole("table", { name: "Ativações do prompt de Assistente" });
    const forced = within(history).getAllByRole("row")[2] as HTMLElement;
    expect(within(forced).getByText("Forçada")).toBeDefined();
    expect(within(forced).getByText("Seed importado; o CI avalia.")).toBeDefined();
    // Dates are formatted for the locale, never raw ISO strings.
    expect(table.textContent).not.toContain("T14:30");
    await expectNoAxeViolations(container);
  });

  it("pages long version and activation lists, twenty rows at a time", async () => {
    const uuid = (index: number) => `01928f6e-7b2a-7c3d-9e4f-${String(index).padStart(12, "0")}`;
    const versions = Array.from({ length: 25 }, (_, index) => buildPromptVersion({ id: uuid(100 + index), version: 25 - index, body: `Prompt ${25 - index}` }));
    const activations = Array.from({ length: 23 }, (_, index) => buildPromptActivation({ id: uuid(200 + index), versionId: uuid(100 + index) }));
    const { user, container } = render({ routes: routes({ [`GET ${BASE}/prompt-versions`]: ok(versions), [`GET ${BASE}/activations`]: ok(activations) }) });
    const table = await versionsTable();
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de versões" })).getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Versões do prompt de Assistente" })).getAllByRole("row")).toHaveLength(6));
    const history = screen.getByRole("table", { name: "Ativações do prompt de Assistente" });
    expect(within(history).getAllByRole("row")).toHaveLength(21);
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de ativações" })).getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Ativações do prompt de Assistente" })).getAllByRole("row")).toHaveLength(4));
    await expectNoAxeViolations(container);
  });

  it("keeps Activate disabled, with the reason, until the version's eval passed", async () => {
    render();
    const table = await versionsTable();
    const activate = within(row(table, "v3")).getByRole("button", { name: "Ativar a versão 3" });
    expect(activate.hasAttribute("disabled")).toBe(true);
    const hint = document.getElementById(activate.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Avalie a versão: só uma avaliação aprovada libera a ativação.");
    expect(within(row(table, "v3")).getByRole("button", { name: "Forçar a ativação da versão 3" })).toBeDefined();
    // The active version has no activation action; an older passing one is a rollback.
    expect(within(row(table, "v2")).queryByRole("button", { name: /Ativar|Reverter|Forçar/u })).toBeNull();
    expect(within(row(table, "v1")).getByRole("button", { name: "Reverter para a versão 1" }).hasAttribute("disabled")).toBe(false);
    expect(within(row(table, "v1")).queryByRole("button", { name: /Forçar/u })).toBeNull();
  });

  it("runs the eval, shows the result per scorer and unlocks activation", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => (release = resolve));
    const { user, api, container } = render({ routes: routes({ [`POST ${BASE}/prompt-versions/:versionId/eval`]: async () => (await gate, ok(buildPromptEvalResult())) }) });
    const table = await versionsTable();
    await user.click(within(row(table, "v3")).getByRole("button", { name: "Avaliar a versão 3" }));
    expect(await screen.findByText(/Rodando a avaliação/u)).toBeDefined();
    expect(within(row(table, "v3")).getByRole("button", { name: "Avaliar a versão 3" }).getAttribute("aria-busy")).toBe("true");
    expect(within(row(table, "v2")).getByRole("button", { name: "Avaliar a versão 2" }).hasAttribute("disabled")).toBe(true);
    api.route(`GET ${BASE}/prompt-versions`, ok([{ ...V3, evalVerdict: "passed", evalExperimentId: "exp_01J8Z3K4M5" }, V2, V1]));
    release(undefined);
    const result = await screen.findByRole("table", { name: "Resultado por avaliador da versão 3" });
    const scorer = within(result).getByRole("row", { name: /tool-routing/u });
    expect(scorer.textContent).toContain("94%");
    expect(within(scorer).getByText("Atingiu o mínimo")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.path).toBe(`/v1/admin/agents/assistant/prompt-versions/${PROMPT_IDS.v3}/eval`);
    await waitFor(() => expect(within(row(table, "v3")).getByRole("button", { name: "Ativar a versão 3" }).hasAttribute("disabled")).toBe(false));
    await expectNoAxeViolations(container);
  });

  it.each([
    [422, "EVAL_DATASET_MISSING", "Este agente ainda não tem um conjunto de avaliação."],
    [502, "UPSTREAM_UNAVAILABLE", "Um serviço necessário está indisponível no momento. Tente novamente em instantes."],
  ])("explains a failed eval run (%i %s) with its reference", async (status, code, copy) => {
    const { user } = render({ routes: routes({ [`POST ${BASE}/prompt-versions/:versionId/eval`]: apiError(status, code) }) });
    await user.click(within(row(await versionsTable(), "v3")).getByRole("button", { name: "Avaliar a versão 3" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A avaliação da versão 3 não rodou");
    expect(alert.textContent).toContain(copy);
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("activates a version whose eval passed after a confirmation", async () => {
    const passed = { ...V3, evalVerdict: "passed" };
    const { user, api, container } = render({
      routes: routes({ [`GET ${BASE}/prompt-versions`]: ok([passed, V2, V1]), [`POST ${BASE}/activations`]: ok(buildPromptActivation({ versionId: PROMPT_IDS.v3 }), 201) }),
    });
    await user.click(within(row(await versionsTable(), "v3")).getByRole("button", { name: "Ativar a versão 3" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ativar a versão 3?" });
    await expectNoAxeViolations(container.ownerDocument.body);
    api.route(`GET ${BASE}/activations`, ok([buildPromptActivation({ id: PROMPT_IDS.v3, versionId: PROMPT_IDS.v3 }), ...ACTIVATIONS]));
    await user.click(within(dialog).getByRole("button", { name: "Ativar versão" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ versionId: PROMPT_IDS.v3 });
    expect(await screen.findByText("Versão 3 de Assistente ativada.")).toBeDefined();
    expect(await screen.findByText("A versão 3 está em produção.")).toBeDefined();
  });

  it("words the activation of an older version as a rollback", async () => {
    const { user, api } = render({ routes: routes({ [`POST ${BASE}/activations`]: ok(buildPromptActivation(), 201) }) });
    await user.click(within(row(await versionsTable(), "v1")).getByRole("button", { name: "Reverter para a versão 1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Reverter para a versão 1?" });
    expect(dialog.textContent).toContain("A versão 2 de Assistente sai de produção");
    await user.click(within(dialog).getByRole("button", { name: "Reverter" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ versionId: PROMPT_IDS.v1 });
    expect(await screen.findByText("Assistente revertido para a versão 1.")).toBeDefined();
  });

  it("keeps the confirmation open with the EVAL_REQUIRED copy when the server refuses", async () => {
    const { user } = render({ routes: routes({ [`POST ${BASE}/activations`]: apiError(409, "EVAL_REQUIRED") }) });
    await user.click(within(row(await versionsTable(), "v1")).getByRole("button", { name: "Reverter para a versão 1" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Reverter" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Execute uma avaliação aprovada antes de ativar esta versão.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("forces an activation only with a reason", async () => {
    const { user, api, container } = render({ routes: routes({ [`POST ${BASE}/activations`]: ok(buildPromptActivation({ versionId: PROMPT_IDS.v3, forced: true, reason: "Dataset em reconstrução." }), 201) }) });
    await user.click(within(row(await versionsTable(), "v3")).getByRole("button", { name: "Forçar a ativação da versão 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Forçar a ativação da versão 3?" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Forçar ativação" }));
    const reason = within(dialog).getByRole("textbox", { name: /^Motivo/u });
    await waitFor(() => expect(reason.getAttribute("aria-invalid")).toBe("true"));
    expect(within(dialog).getByText("Informe o motivo da ativação forçada.")).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
    await user.type(reason, "Dataset em reconstrução.");
    await user.click(within(dialog).getByRole("button", { name: "Forçar ativação" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ versionId: PROMPT_IDS.v3, force: true, reason: "Dataset em reconstrução." });
    expect(await screen.findByText("Versão 3 de Assistente ativada sem avaliação aprovada.")).toBeDefined();
  });

  it("writes a new version from the active text, never editing in place", async () => {
    const created = buildPromptVersion({ id: "01927f3c-0000-7000-8000-000000000004", version: 4, body: `${String(V2["body"])}\nBe kind.`, note: "Mais gentil." });
    const { user, api, container } = render({ routes: routes({ [`POST ${BASE}/prompt-versions`]: ok(created, 201) }) });
    await versionsTable();
    await user.click(screen.getByRole("button", { name: "Nova versão" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova versão do prompt de Assistente" });
    expect(dialog.textContent).toContain("Salvar cria uma nova versão; nada muda em produção");
    await expectNoAxeViolations(container.ownerDocument.body);
    const body = within(dialog).getByRole("textbox", { name: /^Texto do prompt/u });
    expect((body as HTMLTextAreaElement).value).toBe(V2["body"]);
    await user.click(within(dialog).getByRole("button", { name: "Criar versão" }));
    expect(await within(dialog).findByText(/O texto é igual ao da versão ativa/u)).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
    await user.type(body, "\nBe kind.");
    await user.type(within(dialog).getByRole("textbox", { name: /^Nota/u }), "Mais gentil.");
    api.route(`GET ${BASE}/prompt-versions`, ok([created, V3, V2, V1]));
    await user.click(within(dialog).getByRole("button", { name: "Criar versão" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ body: `${String(V2["body"])}\nBe kind.`, note: "Mais gentil." });
    expect(await screen.findByText("Versão 4 criada.")).toBeDefined();
    expect(await within(await versionsTable()).findByText("Mais gentil.")).toBeDefined();
  });

  it("asks before Escape or Cancel discards an edited prompt, and closes an untouched one at once", async () => {
    const { user } = render();
    await versionsTable();
    await user.click(screen.getByRole("button", { name: "Nova versão" }));
    let dialog = await screen.findByRole("dialog", { name: "Nova versão do prompt de Assistente" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Nova versão" }));
    dialog = await screen.findByRole("dialog", { name: "Nova versão do prompt de Assistente" });
    const body = within(dialog).getByRole("textbox", { name: /^Texto do prompt/u });
    await user.type(body, " Be kind.");
    await user.keyboard("{Escape}");
    const question = await screen.findByRole("alertdialog", { name: "Descartar alterações?" });
    await user.click(within(question).getByRole("button", { name: "Continuar editando" }));
    expect(within(dialog).getByRole<HTMLTextAreaElement>("textbox", { name: /^Texto do prompt/u }).value).toContain("Be kind.");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the line diff between the active and the newest version and follows the URL", async () => {
    const { user, router, container } = render();
    const diff = await screen.findByRole("region", { name: "Diferenças da versão 2 para a versão 3" });
    expect(diff.getAttribute("tabindex")).toBe("0");
    const lines = within(diff).getAllByRole("listitem").map((line) => [line.getAttribute("data-kind"), line.textContent]);
    expect(lines).toEqual([
      ["same", " You are the assistant."],
      ["removed", "−Removida:Be brief."],
      ["added", "+Adicionada:Be concise."],
      ["same", " Cite sources."],
      ["added", "+Adicionada:Answer in the user's language."],
    ]);
    expect(screen.getByText("2 linhas adicionadas, 1 removida")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(within(row(await versionsTable(), "v1")).getByRole("button", { name: "Comparar a versão 1" }));
    expect(router.current()).toBe(`${PATH}?compare=1`);
    expect(await screen.findByRole("region", { name: "Diferenças da versão 2 para a versão 1" })).toBeDefined();
  });

  it("reads the compared versions from the URL", async () => {
    render({ path: `${PATH}?base=1&compare=2` });
    expect(await screen.findByRole("region", { name: "Diferenças da versão 1 para a versão 2" })).toBeDefined();
  });

  it("offers to write the first version when the agent still uses the code prompt", async () => {
    const { user, container } = render({ routes: routes({ [`GET ${BASE}/prompt-versions`]: ok([]), [`GET ${BASE}/activations`]: ok([]) }) });
    const empty = await screen.findByRole("heading", { level: 3, name: "Nenhuma versão ainda" });
    expect(screen.getByText("Nenhuma versão ativada: o prompt do código está em produção.")).toBeDefined();
    expect(screen.getByText("Nenhuma ativação registrada.")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(within(empty.closest("[data-slot='state-panel']") as HTMLElement).getByRole("button", { name: "Nova versão" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova versão do prompt de Assistente" });
    await user.click(within(dialog).getByRole("button", { name: "Criar versão" }));
    expect(await within(dialog).findByText("Escreva o texto do prompt.")).toBeDefined();
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: routes({ [`GET ${BASE}/activations`]: apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    expect(screen.getByRole("button", { name: "Nova versão" }).hasAttribute("disabled")).toBe(true);
    await expectNoAxeViolations(container);
    api.route(`GET ${BASE}/activations`, ok(ACTIVATIONS));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await versionsTable()).toBeDefined();
  });

  it("holds writes while offline but still compares", async () => {
    render();
    const table = await versionsTable();
    try {
      setOnline(false);
      await waitFor(() => expect(screen.getByRole("button", { name: "Nova versão" }).hasAttribute("disabled")).toBe(true));
      expect(within(row(table, "v3")).getByRole("button", { name: "Avaliar a versão 3" }).hasAttribute("disabled")).toBe(true);
      expect(within(row(table, "v1")).getByRole("button", { name: "Reverter para a versão 1" }).hasAttribute("disabled")).toBe(true);
      expect(within(row(table, "v3")).getByRole("button", { name: "Forçar a ativação da versão 3" }).hasAttribute("disabled")).toBe(true);
      expect(within(row(table, "v1")).getByRole("button", { name: "Comparar a versão 1" }).hasAttribute("disabled")).toBe(false);
    } finally {
      setOnline(true);
    }
  });

  it("shows cards instead of a table on a phone", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render();
      const list = await screen.findByRole("list", { name: "Versões do prompt de Assistente" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      expect(within(list).getByRole("button", { name: "Avaliar a versão 3" })).toBeDefined();
      expect(screen.getByRole("list", { name: "Ativações do prompt de Assistente" })).toBeDefined();
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });

  it("is closed to the support role without calling the API", async () => {
    const { api } = render({ role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Nova versão" })).toBeNull();
    expect(api.callLines().some((line) => line.includes("/v1/admin/agents"))).toBe(false);
  });

  it("is not found for an agent without a versioned prompt or another path", async () => {
    const unknown = render({ path: "/admin/agents/example-notes/prompts" });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    unknown.unmount();
    render({ path: "/admin/agents/assistant/prompts/extra" });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("renders in Spanish", async () => {
    render({ locale: "es-419" });
    expect(await screen.findByRole("table", { name: "Versiones del prompt de Asistente" })).toBeDefined();
    expect(screen.getByText("La versión 2 está en producción.")).toBeDefined();
  });
});

describe("AdminAgentPromptsView: authors", () => {
  it("names authors and activators with one lookup for the whole page", async () => {
    const { api } = render({ routes: routes({ "GET /v1/admin/users": { status: 200, body: { data: [buildAdminUser({ id: IDS.user, displayName: "Ana Souza" })], meta: { page: { cursor: null, hasMore: false, limit: 100 } } } } }) });
    const table = await versionsTable();
    await waitFor(() => expect(within(row(table, "v3")).getByText("Ana Souza")).toBeDefined());
    expect(within(row(table, "v3")).getByText("Ana Souza").getAttribute("title")).toBe(IDS.user);
    const history = screen.getByRole("table", { name: "Ativações do prompt de Assistente" });
    expect(within(history).getAllByText("Ana Souza")).toHaveLength(ACTIVATIONS.length);
    const lookups = api.calls.filter((call) => call.path === "/v1/admin/users");
    expect(lookups.map((call) => new URLSearchParams(call.query).get("ids"))).toEqual([IDS.user]);
  });

  it("keeps the user id when the names cannot be read", async () => {
    render();
    const table = await versionsTable();
    expect(within(row(table, "v3")).getByText(IDS.user)).toBeDefined();
  });
});
