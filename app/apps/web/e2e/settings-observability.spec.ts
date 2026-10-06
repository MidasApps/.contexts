import type { Page, Route } from "@playwright/test";
import { chatTurn, expect, FAILED_REQUEST, settingsPath, test, toast } from "./sp5-test.ts";

// SP5 Task 16, `/settings` as the organization's owner: usage and own cap, traces after a real
// chat turn, evals, and switching a feature off for the organization. Each page also shows its
// error state (the first answer of its main request fails) and recovers with "Tentar novamente".

const INTERNAL_ERROR = { error: { code: "INTERNAL_ERROR", message: "Simulated failure.", requestId: "e2e-request" } };

/**
 * GET requests matching `url` answer 500 with the error envelope (the client retries on its own,
 * so every attempt fails) until `expectErrorThenRetry` lifts the failure and retries from the UI.
 */
const failGets = async (page: Page, url: RegExp): Promise<() => Promise<void>> => {
  const handler = async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(INTERNAL_ERROR) });
  };
  await page.route(url, handler);
  return () => page.unroute(url, handler);
};

const expectErrorThenRetry = async (page: Page, release: () => Promise<void>): Promise<void> => {
  const retry = page.getByRole("button", { name: "Tentar novamente" }).first();
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/e2e-request/).first()).toBeVisible();
  await release();
  await retry.click();
};

test.describe("usage and budget", () => {
  test("shows the month, the budget and saves and removes an own cap", async ({ page, sp5Org, consoleGuard }) => {
    consoleGuard.allow(FAILED_REQUEST);
    const release = await failGets(page, /\/v1\/usage(\?|$)/);
    await page.goto(settingsPath(sp5Org.id, "usage"));
    await expect(page.getByRole("heading", { level: 1, name: "Uso e orçamento" })).toBeVisible();
    await expectErrorThenRetry(page, release);
    await expect(page.getByRole("region", { name: "Totais do mês" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhum uso neste mês" })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Gasto no mês" })).toBeVisible();

    const ownCap = page.getByRole("region", { name: "Limite próprio da organização" });
    await ownCap.getByRole("textbox", { name: "Limite de gasto mensal" }).fill("999999,00");
    await ownCap.getByRole("button", { name: "Salvar limite" }).click();
    await expect(ownCap.getByText(/maior que o do plano/)).toBeVisible();

    await ownCap.getByRole("textbox", { name: "Limite de gasto mensal" }).fill("12,50");
    await ownCap.getByRole("button", { name: "Salvar limite" }).click();
    await expect(toast(page, "Limite próprio salvo.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Orçamento" }).getByText(/de US\$\s?12,50/)).toBeVisible();

    await page
      .getByRole("region", { name: "Limite próprio da organização" })
      .getByRole("button", { name: "Remover limite próprio" })
      .click();
    await page
      .getByRole("alertdialog", { name: "Remover o limite próprio da organização?" })
      .getByRole("button", { name: "Remover limite" })
      .click();
    await expect(toast(page, /Limite próprio removido/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Orçamento" }).getByText(/de US\$\s?50,00/)).toBeVisible();
  });
});

test.describe("traces", () => {
  test("lists the trace of a chat turn and opens its detail", async ({ page, sp5Org, ownerApi, consoleGuard }) => {
    consoleGuard.allow(FAILED_REQUEST);
    await chatTurn(ownerApi, sp5Org, "Olá, tudo bem?");
    const release = await failGets(page, /\/v1\/traces(\?|$)/);
    await page.goto(settingsPath(sp5Org.id, "traces"));
    await expect(page.getByRole("heading", { level: 1, name: "Rastros" })).toBeVisible();
    await expectErrorThenRetry(page, release);
    const table = page.getByRole("table", { name: `Rastros de ${sp5Org.name}` });
    // The trace is exported by the runtime shortly after the turn ends.
    await expect(async () => {
      await page.reload();
      await expect(table.getByRole("link", { name: /^Abrir o rastro/ }).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await table
      .getByRole("link", { name: /^Abrir o rastro/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Rastro" })).toBeVisible();
    await expect(page.getByText("Id do rastro")).toBeVisible();
    await page.getByRole("link", { name: "Voltar aos rastros" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rastros" })).toBeVisible();
  });

  test("filters by status down to the no-match state", async ({ page, sp5Org }) => {
    await page.goto(settingsPath(sp5Org.id, "traces"));
    // The owner may read the agent catalog, so the agent is picked by name; filters apply at once.
    const filters = page.getByRole("search", { name: "Filtrar rastros" });
    await filters.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Erro" }).click();
    await expect(filters.getByRole("combobox", { name: "Agente" })).toBeEnabled();
    await filters.getByRole("combobox", { name: "Agente" }).click();
    await page.getByRole("option", { name: "Conhecimento" }).click();
    await expect(page.getByRole("heading", { name: "Nenhum rastro com esses filtros" })).toBeVisible();
  });
});

test.describe("evals", () => {
  test("shows experiments and datasets of the organization", async ({ page, sp5Org }) => {
    await page.goto(settingsPath(sp5Org.id, "evals"));
    await expect(page.getByRole("heading", { level: 1, name: "Avaliações" })).toBeVisible();
    // The organization's experiments: empty, or the instructions eval of settings-agents when that
    // file ran first on this worker's organization.
    // Nine columns do not fit the settings column at 1280 px, so the list may render as cards.
    const experiments = page
      .getByRole("table", { name: `Experimentos de ${sp5Org.name}` })
      .or(page.getByRole("list", { name: `Experimentos de ${sp5Org.name}` }));
    await expect(page.getByRole("heading", { name: "Nenhum experimento ainda" }).or(experiments).first()).toBeVisible();
    await page.getByRole("tab", { name: "Conjuntos de dados" }).click();
    await expect(page.getByRole("tabpanel", { name: "Conjuntos de dados" })).toBeVisible();
  });
});

test.describe("features", () => {
  test("switches a feature off for the organization and back on", async ({ page, sp5Org }) => {
    await page.goto(settingsPath(sp5Org.id, "flags"));
    await expect(page.getByRole("heading", { level: 1, name: "Recursos" })).toBeVisible();
    // Features are named in the viewer's language; the key stays as secondary text.
    const voice = page.getByRole("row").filter({ has: page.getByText("chat.voice", { exact: true }) });
    await voice.getByRole("button", { name: "Desligar Voz no chat para a organização" }).click();
    const off = page.getByRole("alertdialog", { name: "Desligar Voz no chat para a organização?" });
    await off.getByRole("button", { name: "Desligar", exact: true }).click();
    await expect(toast(page, "Voz no chat desligado para a organização.")).toBeVisible();
    await expect(voice).toContainText("Desligado pela organização");

    await voice.getByRole("button", { name: "Voltar a usar Voz no chat" }).click();
    const on = page.getByRole("alertdialog", { name: "Voltar a usar Voz no chat?" });
    await on.getByRole("button", { name: "Voltar a usar", exact: true }).click();
    await expect(toast(page, "A organização voltou a usar Voz no chat.")).toBeVisible();
    await expect(voice).toContainText("Ligado pela organização");
  });
});
