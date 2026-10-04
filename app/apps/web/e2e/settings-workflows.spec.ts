import type { Page } from "@playwright/test";
import { expect, FAILED_REQUEST, settingsPath, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16, `/settings/workflows` as the organization's owner: start `approval-demo`, follow
// the run page until it waits for approval, cancel it; then a schedule of `usage-report`: create,
// edit, pause, resume, run now and delete. Workflows are named by their labels (decision 0052):
// `approval-demo` is "Demonstração de aprovação", `usage-report` is "Relatório de uso".
const APPROVAL_DEMO = "Demonstração de aprovação";
const USAGE_REPORT = "Relatório de uso";

const startApprovalDemo = async (page: Page, title: string): Promise<void> => {
  await page.getByRole("button", { name: "Iniciar fluxo" }).first().click();
  const start = page.getByRole("dialog", { name: "Iniciar fluxo" });
  await start.getByRole("combobox", { name: /^Fluxo/ }).click();
  await page.getByRole("option", { name: APPROVAL_DEMO }).click();
  // The input is filled from the workflow's schema, field by field.
  await start.getByRole("textbox", { name: /^Título/ }).fill(title);
  await start.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(toast(page, `Execução de ${APPROVAL_DEMO} iniciada.`)).toBeVisible();
};

test.describe("workflow runs", () => {
  test("starts approval-demo, follows its run page until it waits for approval, and cancels it", async ({
    page,
    sp5Org,
  }) => {
    test.setTimeout(240_000);
    await page.goto(settingsPath(sp5Org.id, "workflows"));
    await expect(page.getByRole("heading", { level: 1, name: "Fluxos e agendamentos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma execução ainda" })).toBeVisible();

    // Invalid input is refused in the dialog before any request.
    await page.getByRole("button", { name: "Iniciar fluxo" }).first().click();
    const start = page.getByRole("dialog", { name: "Iniciar fluxo" });
    await start.getByRole("combobox", { name: /^Fluxo/ }).click();
    await page.getByRole("option", { name: APPROVAL_DEMO }).click();
    await start.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(start.getByText("Preencha este campo.")).toBeVisible();
    await start.getByRole("button", { name: "Editar como JSON" }).click();
    await start.getByRole("textbox", { name: /^Dados de entrada/ }).fill("{not json");
    await start.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(start.getByText("Escreva um objeto JSON válido.")).toBeVisible();
    await start.getByRole("button", { name: "Cancelar" }).click();

    await startApprovalDemo(page, unique("Run to cancel"));
    // Starting opens the run page, which follows the run's events.
    await expect(page.getByRole("heading", { level: 1, name: `Execução de ${APPROVAL_DEMO}` })).toBeVisible();
    await expect(
      page.getByText("Esta página se atualiza sozinha enquanto a execução está em andamento."),
    ).toBeVisible();
    const steps = page.getByRole("list", { name: "Eventos das etapas da execução" });
    await expect(
      steps.getByRole("listitem").filter({ hasText: "Etapa concluída" }).filter({ hasText: "collect-input" }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      steps.getByRole("listitem").filter({ hasText: "Etapa suspensa" }).filter({ hasText: "request-human-approval" }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("link", { name: "Abrir aprovações" })).toHaveAttribute(
      "href",
      new RegExp(`/settings/approvals/[^/]+$`),
    );
    const approvalPath = (
      (await page.getByRole("link", { name: "Abrir aprovações" }).getAttribute("href")) ?? ""
    ).replace(/^\/pt-BR\//, "");

    await page.getByRole("link", { name: "Voltar às execuções" }).click();
    const runs = page.getByRole("table", { name: `Execuções de fluxos de ${sp5Org.name}` });
    const run = runs.getByRole("row").filter({ hasText: APPROVAL_DEMO });
    await expect(run).toContainText("Suspensa");
    await expect(run).toContainText("Aguarda aprovação");
    await run.getByRole("link", { name: new RegExp(`^Abrir a execução .* de ${APPROVAL_DEMO}`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Execução de ${APPROVAL_DEMO}` })).toBeVisible();

    await page.getByRole("button", { name: "Cancelar execução" }).click();
    const cancel = page.getByRole("alertdialog", { name: `Cancelar a execução de ${APPROVAL_DEMO}?` });
    await cancel.getByRole("button", { name: "Cancelar execução" }).click();
    await expect(toast(page, `Execução de ${APPROVAL_DEMO} cancelada.`)).toBeVisible();
    await expect(page.getByText("Cancelada").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("A execução terminou. O estado não muda mais.")).toBeVisible();

    // Follow-up 82: the approval request the run waited for is cancelled with it.
    await page.goto(approvalPath);
    await expect(page.getByRole("heading", { level: 1, name: "Solicitação de aprovação" })).toBeVisible();
    await expect(page.getByText("Cancelada", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("schedules", () => {
  test("creates, edits, pauses, resumes, runs now and deletes a schedule", async ({ page, sp5Org, consoleGuard }) => {
    // The too-frequent cron is refused by the server (422) on purpose.
    consoleGuard.allow(FAILED_REQUEST);
    test.setTimeout(240_000);
    const slug = `e2e-${unique("s").slice(2)}`;
    await page.goto(settingsPath(sp5Org.id, "workflows"));
    await page.getByRole("tab", { name: "Agendamentos" }).click();
    const panel = page.getByRole("tabpanel", { name: "Agendamentos" });
    await expect(panel.getByRole("heading", { name: "Nenhum agendamento" })).toBeVisible();

    await panel.getByRole("button", { name: "Novo agendamento" }).first().click();
    const editor = page.getByRole("dialog", { name: "Novo agendamento" });
    await editor.getByRole("combobox", { name: /^Fluxo/ }).click();
    await page.getByRole("option", { name: USAGE_REPORT }).click();
    await editor.getByRole("textbox", { name: /^Nome curto/ }).fill(slug);
    await editor.getByRole("combobox", { name: /^Frequência/ }).click();
    await page.getByRole("option", { name: "Expressão cron" }).click();
    // Every minute is refused (minimum interval); every 15 minutes is accepted.
    await editor.getByRole("textbox", { name: /^Expressão cron/ }).fill("* * * * *");
    await editor.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(editor.getByText(/O intervalo entre disparos é curto demais/)).toBeVisible();
    await editor.getByRole("textbox", { name: /^Expressão cron/ }).fill("*/15 * * * *");
    await editor.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(toast(page, `Agendamento de ${USAGE_REPORT} criado.`)).toBeVisible();
    // The row shows the slug the organization chose under the workflow's name.
    const row = panel.getByRole("row").filter({ hasText: slug });
    await expect(row).toContainText("*/15 * * * *");
    await expect(row).toContainText("America/Sao_Paulo");
    await expect(row).toContainText("Ativo");
    // The next fire is shown in the schedule's zone (the viewer's zone is the same here).
    await expect(row).toContainText(/\(America\/Sao_Paulo\)/);

    await row.getByRole("button", { name: /^Mais ações do agendamento/ }).click();
    await page.getByRole("menuitem", { name: /^Editar o agendamento/ }).click();
    const edit = page.getByRole("dialog", { name: `Editar agendamento de ${USAGE_REPORT}` });
    await edit.getByRole("textbox", { name: /^Expressão cron/ }).fill("*/30 * * * *");
    await edit.getByRole("button", { name: "Salvar agendamento" }).click();
    await expect(toast(page, `Agendamento de ${USAGE_REPORT} atualizado.`)).toBeVisible();
    await expect(row).toContainText("*/30 * * * *");

    await row.getByRole("button", { name: /^Pausar o agendamento/ }).click();
    await page
      .getByRole("alertdialog", { name: /Pausar o agendamento de/ })
      .getByRole("button", { name: "Pausar agendamento" })
      .click();
    await expect(toast(page, `Agendamento de ${USAGE_REPORT} pausado.`)).toBeVisible();
    await expect(row).toContainText("Pausado");
    await row.getByRole("button", { name: /^Retomar o agendamento/ }).click();
    const resume = page.getByRole("alertdialog", { name: /Retomar o agendamento de/ });
    if (await resume.isVisible()) await resume.getByRole("button", { name: /Retomar/ }).click();
    await expect(toast(page, `Agendamento de ${USAGE_REPORT} retomado.`)).toBeVisible();
    await expect(row).toContainText("Ativo");

    await row.getByRole("button", { name: /^Executar agora o agendamento/ }).click();
    await page
      .getByRole("alertdialog", { name: `Executar ${USAGE_REPORT} agora?` })
      .getByRole("button", { name: "Executar agora" })
      .click();
    await expect(toast(page, `Execução de ${USAGE_REPORT} iniciada.`)).toBeVisible();
    // Scoped to each panel: the schedule's row also names the workflow, so an unscoped row matched
    // it before the tab had changed.
    await page.getByRole("tab", { name: "Execuções" }).click();
    const runsPanel = page.getByRole("tabpanel", { name: "Execuções" });
    await expect(runsPanel.getByRole("row").filter({ hasText: USAGE_REPORT }).first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Agendamentos" }).click();
    await expect(page.getByRole("tab", { name: "Agendamentos" })).toHaveAttribute("aria-selected", "true");
    await row.getByRole("button", { name: /^Mais ações do agendamento/ }).click();
    await page.getByRole("menuitem", { name: /^Excluir o agendamento/ }).click();
    await page
      .getByRole("alertdialog", { name: /Excluir o agendamento de/ })
      .getByRole("button", { name: "Excluir agendamento" })
      .click();
    await expect(toast(page, `Agendamento de ${USAGE_REPORT} excluído.`)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Nenhum agendamento" })).toBeVisible();
  });
});
