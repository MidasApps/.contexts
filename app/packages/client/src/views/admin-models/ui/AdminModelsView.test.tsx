import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildModelSettings } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { AdminModelsView } from "./AdminModelsView.tsx";

const SETTINGS = buildModelSettings();
const CLAUDE = {
  modelId: "anthropic/claude-test",
  inputMicroUsdPerMTok: 3_000_000,
  outputMicroUsdPerMTok: 15_000_000,
};
const ROLES = {
  chat: "openai/gpt-6-sol",
  fast: "openai/gpt-6-luna",
  reasoning: "openai/gpt-6-sol",
  judge: "openai/gpt-6-luna",
};

const render = (routes: FakeRoutes = {}) =>
  renderAdmin(<AdminModelsView />, {
    path: "/admin/models",
    routes: { "GET /v1/admin/models": ok(SETTINGS), "PUT /v1/admin/models": ok(SETTINGS), ...routes },
  });

const putBody = (api: ReturnType<typeof render>["api"]): unknown =>
  api.calls.find((call) => call.method === "PUT")?.body;

const retype = async (user: ReturnType<typeof render>["user"], input: HTMLElement, text: string): Promise<void> => {
  await user.clear(input);
  await user.type(input, text);
};

// Prices typed key by key: the default 5 s is too tight when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

describe("AdminModelsView", () => {
  it("shows the model of each role, the fixed roles read only and the price table", async () => {
    const { container } = render();
    const chat = await screen.findByRole("combobox", { name: "Conversa" });
    expect(chat.textContent).toContain("openai/gpt-6-sol");
    expect(screen.getByRole("combobox", { name: "Tarefas rápidas" }).textContent).toContain("openai/gpt-6-luna");
    expect(screen.getByText("Títulos, resumos e verificações de segurança.")).toBeDefined();
    expect(screen.getAllByText("US$ 2,00 entrada · US$ 10,00 saída por 1M").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: "Embeddings" })).toBeNull();
    expect(screen.getByText("openai/text-embedding-3-small")).toBeDefined();
    expect(screen.getByText("Definido no ambiente do runtime.")).toBeDefined();
    const table = screen.getByRole("table", { name: "Preço dos modelos" });
    const claude = within(table).getByRole("row", { name: /anthropic\/claude-test/u });
    expect(claude.textContent).toContain("Equipe");
    expect(claude.textContent).toContain("Sem chave");
    expect(
      within(table).getByRole<HTMLInputElement>("textbox", { name: "Preço de entrada de openai/gpt-6-luna" }).value,
    ).toBe("0,10");
    expect(screen.getByText(/^Atualizado em/u)).toBeDefined();
    expect(screen.queryByText(/modo simulado/u)).toBeNull();
    expect(screen.getByRole("button", { name: "Salvar" }).hasAttribute("disabled")).toBe(true);
    await expectNoAxeViolations(container);
  });

  it("says the runtime is simulated in fake mode", async () => {
    const { container } = render({
      "GET /v1/admin/models": ok(buildModelSettings({ aiMode: "fake", updatedAt: null })),
    });
    expect(await screen.findByText(/O runtime está em modo simulado/u)).toBeDefined();
    expect(screen.queryByText(/^Atualizado em/u)).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("offers a model whose provider has no key as a disabled option", async () => {
    const { user } = render();
    await user.click(await screen.findByRole("combobox", { name: "Conversa" }));
    const option = await screen.findByRole("option", { name: /^anthropic\/claude-test .*\(provedor sem chave\)$/u });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("option", { name: /^openai\/gpt-6-astra/u }).getAttribute("aria-disabled")).toBeNull();
  });

  it("never offers an embedding model to a text role", async () => {
    const embedding = {
      modelId: "google/gemini-embedding-2",
      inputMicroUsdPerMTok: 200_000,
      outputMicroUsdPerMTok: 0,
      source: "code",
      available: true,
      kind: "embedding",
    };
    const { user } = render({
      "GET /v1/admin/models": ok(buildModelSettings({ models: [...(SETTINGS["models"] as unknown[]), embedding] })),
    });
    await user.click(await screen.findByRole("combobox", { name: "Conversa" }));
    expect(await screen.findByRole("option", { name: /^openai\/gpt-6-sol/u })).toBeDefined();
    expect(screen.queryByRole("option", { name: /gemini-embedding-2/u })).toBeNull();
  });

  it("saves the chosen models and the edited prices, then shows the toast", async () => {
    const { user, api } = render();
    await user.click(await screen.findByRole("combobox", { name: "Conversa" }));
    await user.click(await screen.findByRole("option", { name: /^openai\/gpt-6-astra/u }));
    await retype(user, screen.getByRole("textbox", { name: "Preço de entrada de openai/gpt-6-luna" }), "0,075");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Modelos salvos.")).toBeDefined();
    expect(putBody(api)).toEqual({
      roles: { ...ROLES, chat: "openai/gpt-6-astra" },
      models: [CLAUDE, { modelId: "openai/gpt-6-luna", inputMicroUsdPerMTok: 75_000, outputMicroUsdPerMTok: 500_000 }],
    });
  });

  it("adds a model that a role can then run on and saves its price", async () => {
    const { user, api } = render();
    const add = await screen.findByRole("form", { name: "Adicionar modelo" });
    await user.type(within(add).getByRole("textbox", { name: "Modelo" }), "openai/gpt-6-nova");
    await user.type(within(add).getByRole("textbox", { name: "Entrada (US$ / 1M tokens)" }), "1,25");
    await user.type(within(add).getByRole("textbox", { name: "Saída (US$ / 1M tokens)" }), "5");
    await user.click(within(add).getByRole("button", { name: "Adicionar modelo" }));
    const table = screen.getByRole("table", { name: "Preço dos modelos" });
    expect(within(table).getByRole("row", { name: /openai\/gpt-6-nova/u }).textContent).toContain("Disponível");
    await user.click(screen.getByRole("combobox", { name: "Tarefas rápidas" }));
    await user.click(await screen.findByRole("option", { name: /^openai\/gpt-6-nova/u }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(putBody(api)).toEqual({
        roles: { ...ROLES, fast: "openai/gpt-6-nova" },
        models: [
          CLAUDE,
          { modelId: "openai/gpt-6-nova", inputMicroUsdPerMTok: 1_250_000, outputMicroUsdPerMTok: 5_000_000 },
        ],
      }),
    );
  });

  it("refuses a model id outside provider/model before adding it", async () => {
    const { user } = render();
    const add = await screen.findByRole("form", { name: "Adicionar modelo" });
    const modelId = within(add).getByRole("textbox", { name: "Modelo" });
    await user.type(modelId, "gpt-6-nova");
    await user.type(within(add).getByRole("textbox", { name: "Entrada (US$ / 1M tokens)" }), "1");
    await user.type(within(add).getByRole("textbox", { name: "Saída (US$ / 1M tokens)" }), "2");
    await user.click(within(add).getByRole("button", { name: "Adicionar modelo" }));
    expect(within(add).getByText(/Use provedor\/modelo/u)).toBeDefined();
    expect(modelId.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("row", { name: /gpt-6-nova/u })).toBeNull();
  });

  it("leaves a restored staff price out of the save and puts an edited code price back", async () => {
    const { user, api } = render();
    await user.click(await screen.findByRole("button", { name: "Restaurar o preço de anthropic/claude-test" }));
    expect(screen.getByRole("row", { name: /anthropic\/claude-test/u }).textContent).toContain("Sai ao salvar");
    const sol = screen.getByRole("textbox", { name: "Preço de saída de openai/gpt-6-sol" });
    await retype(user, sol, "12");
    await user.click(screen.getByRole("button", { name: "Restaurar o preço de openai/gpt-6-sol" }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Preço de saída de openai/gpt-6-sol" }).value).toBe(
      "10,00",
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(putBody(api)).toEqual({ roles: ROLES, models: [] }));
  });

  it("shows why a refused save failed, with its reference", async () => {
    const { user } = render({ "PUT /v1/admin/models": apiError(400, "VALIDATION_FAILED") });
    await user.click(await screen.findByRole("combobox", { name: "Avaliador" }));
    await user.click(await screen.findByRole("option", { name: /^openai\/gpt-6-astra/u }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("cada função precisa de um modelo com preço");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("shows a failed load with its reference and recovers on retry", async () => {
    const { user, api } = render({ "GET /v1/admin/models": apiError(409, "CONFLICT") });
    expect(await screen.findByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    api.route("GET /v1/admin/models", ok(SETTINGS));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("combobox", { name: "Conversa" })).toBeDefined();
  });

  it("is closed to the support role", async () => {
    const { api } = renderAdmin(<AdminModelsView />, { path: "/admin/models", role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/models");
  });
});
