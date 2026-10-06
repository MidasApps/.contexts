import { ERROR_ENVELOPE, failUntilHealed } from "./admin-helpers.ts";
import { entry, expect, FAILED_REQUEST, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16: the `/admin` console as platform staff (SMS second factor done in the setup
// project): overview, organizations (search, detail, plan, suspend), plans. Each journey ends with
// a clean browser console (sp5-test.ts).

test.describe("overview", () => {
  test("shows the platform numbers and the areas of the role", async ({ staffPage }) => {
    await staffPage.goto("admin");
    await expect(staffPage.getByRole("heading", { level: 1, name: "Administração da plataforma" })).toBeVisible();
    const kpis = staffPage.getByRole("region", { name: "Números da plataforma" });
    for (const term of [
      "Organizações ativas",
      "Usuários ativos",
      "Custo no mês",
      "Paradas por guardrail",
      "Aprovações",
      "Avaliação dos agentes",
    ]) {
      await expect(kpis.getByRole("term").filter({ hasText: term })).toBeVisible();
    }
    // At least Alpha, Beta and this worker's organization are active.
    await expect(kpis.getByRole("definition").first()).toHaveText(/^\d+$/);
    expect(Number(await kpis.getByRole("definition").first().textContent())).toBeGreaterThanOrEqual(2);
    const areas = staffPage.getByRole("region", { name: "Áreas" });
    for (const area of [
      "Organizações",
      "Planos",
      "Usuários",
      "Agentes e prompts",
      "Conectores",
      "Avaliações",
      "Traces",
      "Logs",
      "Custos",
      "Workflows",
      "Flags",
    ]) {
      await expect(areas.getByRole("link", { name: new RegExp(`^${area} `) })).toBeVisible();
    }
  });

  test("shows the error with its reference and recovers on retry", async ({ staffPage, staffConsole }) => {
    staffConsole.allow(FAILED_REQUEST);
    const heal = await failUntilHealed(staffPage, "**/v1/admin/overview**");
    await staffPage.goto("admin");
    await expect(staffPage.getByText(/Referência: e2e-request-1/)).toBeVisible({ timeout: 30_000 });
    heal();
    await staffPage.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(staffPage.getByRole("region", { name: "Números da plataforma" })).toBeVisible();
  });
});

test.describe("organizations", () => {
  test("searches on the server, opens the detail with the member count", async ({ staffPage, sp5Org }) => {
    await staffPage.goto("admin/organizations");
    const table = staffPage.getByRole("table", { name: "Organizações da plataforma" });
    await expect(table.getByRole("row").nth(1)).toBeVisible();
    await staffPage.getByRole("searchbox", { name: "Buscar organização" }).fill(sp5Org.name);
    await staffPage.getByRole("searchbox", { name: "Buscar organização" }).press("Enter");
    await expect(entry(staffPage, sp5Org.name)).toHaveCount(1);
    await expect(entry(staffPage, "Alpha Org")).toHaveCount(0);
    await expect(staffPage).toHaveURL(/[?&]q=/);

    await staffPage.getByRole("searchbox", { name: "Buscar organização" }).fill("no organization has this name 0000");
    await staffPage.getByRole("searchbox", { name: "Buscar organização" }).press("Enter");
    await expect(staffPage.getByRole("heading", { name: "Nenhuma organização com esses filtros" })).toBeVisible();
    await staffPage.getByRole("button", { name: "Limpar filtros" }).first().click();
    await expect(entry(staffPage, "Alpha Org")).toHaveCount(1);

    // `q` is the page's search key: with an unknown key the list was unfiltered, and once the run had
    // created more organizations than a page holds, this one was not on the first page.
    await staffPage.goto(`admin/organizations?q=${encodeURIComponent(sp5Org.name)}`);
    await staffPage.getByRole("link", { name: `Abrir ${sp5Org.name}` }).click();
    await expect(staffPage.getByRole("heading", { level: 1, name: sp5Org.name })).toBeVisible();
    const summary = staffPage.getByRole("region", { name: "Resumo" });
    await expect(summary.getByRole("definition").filter({ hasText: "pessoas com acesso" })).toHaveText(
      "1 pessoas com acesso",
    );
    await expect(summary.getByRole("definition").filter({ hasText: /^Ativa$/ })).toBeVisible();
  });

  test("shows the loading state, then the error state of the list", async ({ staffPage, staffConsole }) => {
    staffConsole.allow(FAILED_REQUEST);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await staffPage.route("**/v1/admin/organizations?**", async (route) => {
      await held;
      await route.fulfill({ status: 500, json: ERROR_ENVELOPE });
    });
    await staffPage.goto("admin/organizations");
    await expect(staffPage.getByText("Carregando organizações…")).toBeVisible();
    release();
    await expect(staffPage.getByText(/Referência: e2e-request-1/)).toBeVisible({ timeout: 30_000 });
    await staffPage.unrouteAll({ behavior: "ignoreErrors" });
    await staffPage.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(entry(staffPage, "Alpha Org")).toHaveCount(1);
  });

  test("creates a plan, assigns it, then suspends and reactivates the organization", async ({ staffPage, sp5Org }) => {
    const plan = unique("Starter");
    await staffPage.goto("admin/plans");
    await staffPage.getByRole("button", { name: "Novo plano" }).first().click();
    const dialog = staffPage.getByRole("dialog", { name: "Novo plano" });
    await dialog.getByRole("textbox", { name: /^Nome/ }).fill(plan);
    await dialog.getByRole("textbox", { name: /^Gasto mensal com modelos/ }).fill("25,00");
    await dialog.getByRole("spinbutton", { name: /^Tokens por mês/ }).fill("1000000");
    await dialog.getByRole("button", { name: "Criar plano" }).click();
    await expect(toast(staffPage, `Plano ${plan} criado.`)).toBeVisible();

    await staffPage.goto(`admin/organizations/${sp5Org.id}`);
    await expect(staffPage.getByRole("heading", { level: 1, name: sp5Org.name })).toBeVisible();
    await staffPage.getByRole("combobox", { name: "Plano da organização" }).click();
    await staffPage.getByRole("option", { name: plan }).click();
    await staffPage.getByRole("button", { name: "Salvar plano" }).click();
    await expect(toast(staffPage, `Plano de ${sp5Org.name} atualizado.`)).toBeVisible();
    const summary = staffPage.getByRole("region", { name: "Resumo" });
    await expect(summary.getByRole("definition").filter({ hasText: plan })).toBeVisible();
    await expect(summary).toContainText("US$ 25,00");

    await staffPage.getByRole("button", { name: "Suspender organização" }).click();
    const suspend = staffPage
      .getByRole("alertdialog", { name: `Suspender ${sp5Org.name}?` })
      .or(staffPage.getByRole("dialog", { name: `Suspender ${sp5Org.name}?` }));
    await suspend.getByRole("button", { name: "Suspender", exact: true }).click();
    await expect(toast(staffPage, `${sp5Org.name} foi suspensa.`)).toBeVisible();
    await expect(summary.getByRole("definition").filter({ hasText: /^Suspensa$/ })).toBeVisible();

    await staffPage.getByRole("button", { name: "Reativar organização" }).click();
    const reactivate = staffPage
      .getByRole("alertdialog", { name: `Reativar ${sp5Org.name}?` })
      .or(staffPage.getByRole("dialog", { name: `Reativar ${sp5Org.name}?` }));
    await reactivate.getByRole("button", { name: "Reativar", exact: true }).click();
    await expect(toast(staffPage, `${sp5Org.name} foi reativada.`)).toBeVisible();
    await expect(summary.getByRole("definition").filter({ hasText: /^Ativa$/ })).toBeVisible();

    // Back to the platform default, so other journeys of this worker see the default caps.
    await staffPage.getByRole("combobox", { name: "Plano da organização" }).click();
    await staffPage.getByRole("option", { name: "Padrão da plataforma (sem plano)" }).click();
    await staffPage.getByRole("button", { name: "Salvar plano" }).click();
    await expect(toast(staffPage, `Plano de ${sp5Org.name} atualizado.`)).toBeVisible();
  });
});

test.describe("plans", () => {
  test("edits a plan's limits", async ({ staffPage }) => {
    const plan = unique("Growth");
    await staffPage.goto("admin/plans");
    await staffPage.getByRole("button", { name: "Novo plano" }).first().click();
    const create = staffPage.getByRole("dialog", { name: "Novo plano" });
    await create.getByRole("textbox", { name: /^Nome/ }).fill(plan);
    await create.getByRole("textbox", { name: /^Gasto mensal com modelos/ }).fill("10,00");
    await create.getByRole("spinbutton", { name: /^Tokens por mês/ }).fill("500000");
    await create.getByRole("button", { name: "Criar plano" }).click();
    await expect(staffPage.getByRole("row").filter({ hasText: plan })).toContainText("US$ 10,00");

    await staffPage.getByRole("button", { name: `Editar o plano ${plan}` }).click();
    const edit = staffPage.getByRole("dialog", { name: `Editar o plano ${plan}` });
    await edit.getByRole("textbox", { name: /^Gasto mensal com modelos/ }).fill("12,50");
    await edit.getByRole("spinbutton", { name: /^Máximo de conectores/ }).fill("3");
    await edit.getByRole("button", { name: "Salvar plano" }).click();
    await expect(toast(staffPage, `Plano ${plan} atualizado.`)).toBeVisible();
    await expect(staffPage.getByRole("row").filter({ hasText: plan })).toContainText("US$ 12,50");
    await expect(staffPage.getByRole("row").filter({ hasText: plan })).toContainText("3");
  });
});
