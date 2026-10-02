import { chooseOrganization, failUntilHealed } from "./admin-helpers.ts";
import { chatTurn, expect, FAILED_REQUEST, test } from "./sp5-test.ts";

// SP5 Task 16: `/admin` traces, costs and logs after a real chat turn of an organization (fake
// models, `AI_MODE=fake`). Fake models have no price (model-prices.ts lists verified provider
// prices only), so the ledger rows count tokens with an unknown cost: the pages say so.

/** Today's date as the `<input type="date">` value, in the browser's zone (America/Sao_Paulo). */
const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());


test.describe("after a chat turn of the organization", () => {
  test("traces lists the turn for the organization and today, and opens its span tree", async ({ staffPage, ownerApi, sp5Org }) => {
    test.setTimeout(180_000);
    await chatTurn(ownerApi, sp5Org, "Olá! Pode me ajudar com uma dúvida?");
    await staffPage.goto("admin/traces");
    const filters = staffPage.getByRole("search", { name: "Filtrar traces" });
    await chooseOrganization(staffPage, filters.getByRole("combobox", { name: "Organização", exact: true }), sp5Org.name);
    await filters.getByRole("textbox", { name: "De" }).fill(today());
    await filters.getByRole("textbox", { name: "Até" }).fill(today());
    await filters.getByRole("button", { name: "Filtrar" }).click();
    await expect(staffPage).toHaveURL(new RegExp(`organizationId=${sp5Org.id}`));
    const table = staffPage.getByRole("table", { name: "Traces de execução" });
    const turn = table.getByRole("row").filter({ hasText: "assistant-chat" }).first();
    // Spans reach the trace store a few seconds after the turn (batched export): reload like staff
    // would; the filters stay in the URL.
    await expect(async () => {
      await staffPage.reload();
      await expect(turn).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await expect(staffPage).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
    await expect(turn).toContainText(sp5Org.name);
    await expect(turn).toContainText("OK");
    // Every row is this organization's.
    for (const row of await table.getByRole("row").all()) {
      const text = (await row.textContent()) ?? "";
      if (!text.startsWith("Trace")) expect(text).toContain(sp5Org.name);
    }

    await turn.getByRole("link", { name: /^Abrir o trace / }).click();
    await expect(staffPage).toHaveURL(/\/admin\/traces\/[0-9a-f]{32}/);
    await expect(staffPage.getByRole("heading", { level: 1, name: "agent run: 'assistant-chat'" })).toBeVisible();
    const summary = staffPage.getByRole("region", { name: "Resumo do trace" });
    await expect(summary.getByRole("definition").filter({ hasText: sp5Org.name })).toBeVisible();
    await expect(summary).toContainText("Preço desconhecido");
    const spans = staffPage.getByRole("list", { name: /^\d+ spans$/ });
    const root = spans.getByRole("listitem").first();
    await expect(root).toContainText("agent_run");
    await expect(root.getByRole("button", { name: "Recolher os spans de agent run: 'assistant-chat'" })).toHaveAttribute("aria-expanded", "true");
    // Model spans carry their tokens.
    await expect(spans.getByRole("definition").filter({ hasText: /^[1-9][\d.]* de entrada · \d[\d.]* de saída$/ }).first()).toBeVisible();
    await expect(staffPage.getByRole("link", { name: "Ver logs deste trace" })).toHaveAttribute("href", /\/admin\/logs\?traceId=[0-9a-f]{32}$/);
  });

  test("traces shows the empty state for a day without runs", async ({ staffPage, sp5Org }) => {
    await staffPage.goto(`admin/traces?organizationId=${sp5Org.id}&from=2020-01-01&to=2020-01-02`);
    await expect(staffPage.getByRole("heading", { name: /^Nenhum trace/ })).toBeVisible();
  });

  test("costs shows the organization's calls and tokens by day and by model", async ({ staffPage, ownerApi, sp5Org }) => {
    test.setTimeout(120_000);
    // Its own turn, so the journey also runs alone; the ledger row is written when the turn ends.
    await chatTurn(ownerApi, sp5Org, "Quanto custa uma resposta?");
    await staffPage.goto("admin/costs");
    const usage = staffPage.getByRole("region", { name: "Uso por dia e por modelo" });
    await chooseOrganization(staffPage, usage.getByRole("combobox", { name: "Organização", exact: true }), sp5Org.name);
    await expect(staffPage).toHaveURL(new RegExp(`organizationId=${sp5Org.id}`));
    const status = usage.getByRole("status").filter({ hasText: "chamadas" });
    // The ledger row is written by the runtime's exporter after the turn's stream ends, so the
    // first read can come before it: reload until it is there.
    await expect(async () => {
      await staffPage.reload();
      await expect(status).toHaveText(/em [1-9]\d* chamadas e [\d.]+ tokens\./, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await expect(usage.getByText(/chamadas? sem preço conhecido/)).toBeVisible();
    await expect(usage.getByRole("table", { name: "Custo por dia" }).getByRole("row")).not.toHaveCount(1);
    const byModel = usage.getByRole("table", { name: "Custo por modelo" });
    await expect(byModel.getByRole("row").filter({ hasText: /fake-(chat|fast)/ }).first()).toBeVisible();

    await usage.getByRole("textbox", { name: "De" }).fill("2020-01-01");
    await usage.getByRole("textbox", { name: "Até" }).fill("2020-01-02");
    await expect(usage.getByRole("heading", { name: "Nenhum uso no período" })).toBeVisible();
    await usage.getByRole("button", { name: "Voltar ao mês atual" }).click();
    await expect(status).toHaveText(/em [1-9]\d* chamadas/);

    const budgets = staffPage.getByRole("table", { name: "Orçamentos por organização" });
    await expect(budgets.getByRole("row").filter({ hasText: sp5Org.name })).toContainText("US$ 50,00");
  });

  test("costs shows the error state with its reference and recovers", async ({ staffPage, staffConsole }) => {
    staffConsole.allow(FAILED_REQUEST);
    const heal = await failUntilHealed(staffPage, "**/v1/admin/usage**");
    await staffPage.goto("admin/costs");
    const usage = staffPage.getByRole("region", { name: "Uso por dia e por modelo" });
    await expect(usage.getByText(/Referência: e2e-request-1/)).toBeVisible({ timeout: 30_000 });
    heal();
    await usage.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(usage.getByRole("status").filter({ hasText: "chamadas" })).toBeVisible();
  });
});

test.describe("logs", () => {
  test("filters the web process lines by text and level", async ({ staffPage }) => {
    await staffPage.goto("admin/logs");
    const lines = staffPage.getByRole("list", { name: "Linhas de log" });
    await expect(lines.getByRole("listitem").first()).toBeVisible();
    const filters = staffPage.getByRole("search", { name: "Filtrar logs" });
    await filters.getByRole("textbox", { name: "Texto da mensagem" }).fill("admin_list_organizations_ok");
    await filters.getByRole("button", { name: "Aplicar" }).click();
    await expect(staffPage).toHaveURL(/admin_list_organizations_ok/);
    await expect(lines.getByRole("listitem").first()).toContainText("admin_list_organizations_ok");
    for (const line of await lines.getByRole("listitem").all()) await expect(line).toContainText("admin_list_organizations_ok");

    await filters.getByRole("textbox", { name: "Texto da mensagem" }).fill("no line has this text 0000");
    await filters.getByRole("button", { name: "Aplicar" }).click();
    await expect(staffPage.getByRole("heading", { name: "Nenhuma linha com esses filtros" })).toBeVisible();
  });
});
