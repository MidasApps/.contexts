import type { Page } from "@playwright/test";
import { expect, FAILED_REQUEST, settingsPath, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16, `/settings/workflows` as the organization's owner: start `approval-demo`, follow
// the run page until it waits for approval, cancel it; then a schedule of `usage-report`: create,
// edit, pause, resume, run now and delete.

const startApprovalDemo = async (page: Page, title: string): Promise<void> => {
  await page.getByRole("button", { name: "Iniciar fluxo" }).first().click();
  const start = page.getByRole("dialog", { name: "Iniciar fluxo" });
  await start.getByRole("combobox", { name: /^Fluxo/ }).click();
  await page.getByRole("option", { name: /approval-demo/ }).click();
  await start.getByRole("textbox", { name: /^Dados de entrada/ }).fill(JSON.stringify({ title }));
  await start.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(toast(page, /Execução de .*approval-demo.* iniciada\./)).toBeVisible();
};

test.describe("workflow runs", () => {
  test("starts approval-demo, follows its run page until it waits for approval, and cancels it", async ({ page, sp5Org }) => {
    test.setTimeout(240_000);
    await page.goto(settingsPath(sp5Org.id, "workflows"));
    await expect(page.getByRole("heading", { level: 1, name: "Fluxos e agendamentos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma execução ainda" })).toBeVisible();

    // Invalid input is refused in the dialog before any request.
    await page.getByRole("button", { name: "Iniciar fluxo" }).first().click();
    const start = page.getByRole("dialog", { name: "Iniciar fluxo" });
    await start.getByRole("combobox", { name: /^Fluxo/ }).click();
    await page.getByRole("option", { name: /approval-demo/ }).click();
    await start.getByRole("textbox", { name: /^Dados de entrada/ }).fill("{not json");
    await start.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(start.getByText("Escreva um objeto JSON válido.")).toBeVisible();
    await start.getByRole("button", { name: "Cancelar" }).click();

    await startApprovalDemo(page, unique("Run to cancel"));
    // Starting opens the run page, which follows the run's events.
    await expect(page.getByRole("heading", { level: 1, name: "Execução de approval-demo" })).toBeVisible();
    await expect(page.getByText("Esta página se atualiza sozinha enquanto a execução está em andamento.")).toBeVisible();
    const steps = page.getByRole("list", { name: "Eventos das etapas da execução" });
    await expect(steps.getByRole("listitem").filter({ hasText: "Etapa concluída" }).filter({ hasText: "collect-input" })).toBeVisible({ timeout: 90_000 });
    await expect(steps.getByRole("listitem").filter({ hasText: "Etapa suspensa" }).filter({ hasText: "request-human-approval" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("link", { name: "Abrir aprovações" })).toHaveAttribute("href", new RegExp(`/settings/approvals/[^/]+$`));

    await page.getByRole("link", { name: "Voltar às execuções" }).click();
    const runs = page.getByRole("table", { name: `Execuções de fluxos de ${sp5Org.name}` });
    const run = runs.getByRole("row").filter({ hasText: "approval-demo" });
    await expect(run).toContainText("Suspensa");
    await expect(run).toContainText("Aguarda aprovação");
    await run.getByRole("link", { name: /^Abrir a execução .* de approval-demo/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Execução de approval-demo" })).toBeVisible();

    await page.getByRole("button", { name: "Cancelar execução" }).click();
    const cancel = page.getByRole("alertdialog", { name: "Cancelar a execução de approval-demo?" });
    await cancel.getByRole("button", { name: "Cancelar execução" }).click();
    await expect(toast(page, /Execução de .*approval-demo.* cancelada\./)).toBeVisible();
    await expect(page.getByText("Cancelada").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("A execução terminou. O estado não muda mais.")).toBeVisible();
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
    await page.getByRole("option", { name: /usage-report/ }).click();
    await editor.getByRole("textbox", { name: /^Nome curto/ }).fill(slug);
    await editor.getByRole("combobox", { name: /^Frequência/ }).click();
    await page.getByRole("option", { name: "Expressão cron" }).click();
    // Every minute is refused (minimum interval); every 15 minutes is accepted.
    await editor.getByRole("textbox", { name: /^Expressão cron/ }).fill("* * * * *");
    await editor.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(editor.getByText(/O intervalo entre disparos é curto demais/)).toBeVisible();
    await editor.getByRole("textbox", { name: /^Expressão cron/ }).fill("*/15 * * * *");
    await editor.getByRole("button", { name: "Criar agendamento" }).click();
    await expect(toast(page, /Agendamento de .*usage-report.* criado\./)).toBeVisible();
    const row = panel.getByRole("row").filter({ hasText: "usage-report" });
    await expect(row).toContainText("*/15 * * * *");
    await expect(row).toContainText("America/Sao_Paulo");
    await expect(row).toContainText("Ativo");
    // The next fire is shown in the schedule's zone (the viewer's zone is the same here).
    await expect(row).toContainText(/\(America\/Sao_Paulo\)/);

    await row.getByRole("button", { name: /^Editar o agendamento/ }).click();
    const edit = page.getByRole("dialog", { name: /Editar agendamento de .*usage-report/ });
    await edit.getByRole("textbox", { name: /^Expressão cron/ }).fill("*/30 * * * *");
    await edit.getByRole("button", { name: "Salvar agendamento" }).click();
    await expect(toast(page, /Agendamento de .*usage-report.* atualizado\./)).toBeVisible();
    await expect(row).toContainText("*/30 * * * *");

    await row.getByRole("button", { name: /^Pausar o agendamento/ }).click();
    await page.getByRole("alertdialog", { name: /Pausar o agendamento de/ }).getByRole("button", { name: "Pausar agendamento" }).click();
    await expect(toast(page, /Agendamento de .*usage-report.* pausado\./)).toBeVisible();
    await expect(row).toContainText("Pausado");
    await row.getByRole("button", { name: /^Retomar o agendamento/ }).click();
    const resume = page.getByRole("alertdialog", { name: /Retomar o agendamento de/ });
    if (await resume.isVisible()) await resume.getByRole("button", { name: /Retomar/ }).click();
    await expect(toast(page, /Agendamento de .*usage-report.* retomado\./)).toBeVisible();
    await expect(row).toContainText("Ativo");

    await row.getByRole("button", { name: /^Executar agora o agendamento/ }).click();
    await page.getByRole("alertdialog", { name: /Executar .*usage-report.* agora\?/ }).getByRole("button", { name: "Executar agora" }).click();
    await expect(toast(page, /Execução de .*usage-report.* iniciada\./)).toBeVisible();
    await page.getByRole("tab", { name: "Execuções" }).click();
    await expect(page.getByRole("row").filter({ hasText: "usage-report" }).first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Agendamentos" }).click();
    await row.getByRole("button", { name: /^Excluir o agendamento/ }).click();
    await page.getByRole("alertdialog", { name: /Excluir o agendamento de/ }).getByRole("button", { name: "Excluir agendamento" }).click();
    await expect(toast(page, /Agendamento de .*usage-report.* excluído\./)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Nenhum agendamento" })).toBeVisible();
  });
});
