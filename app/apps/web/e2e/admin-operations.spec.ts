import { chooseOrganization } from "./admin-helpers.ts";
import { expect, test, toast, unique } from "./sp5-test.ts";

const APPROVAL_DEMO = "Demonstração de aprovação";
const CATALOG_REINDEX = "Reindexação do catálogo";

// SP5 Task 16: `/admin` operations: an organization's flag override (set, then removed), workflow
// runs (a suspended `approval-demo` run cancelled by staff), platform schedules (pause and resume
// behind a confirmation that says it stops the job for everyone) and connectors (read only).

type StartedRun = { runId: string };

test.describe("flags", () => {
  test("sets an organization override and removes it", async ({ staffPage, sp5Org }) => {
    await staffPage.goto("admin/flags");
    await chooseOrganization(staffPage, staffPage.getByRole("combobox", { name: "Ajuste por organização" }), sp5Org.name);
    await expect(staffPage).toHaveURL(new RegExp(`organizationId=${sp5Org.id}`));
    await expect(staffPage.getByText("Remova o ajuste para ela voltar a seguir o valor do ambiente.")).toBeVisible();
    const row = staffPage.getByRole("row").filter({ has: staffPage.getByRole("switch", { name: "Valor de chat.voice no ambiente", exact: true }) });
    await expect(row).toContainText("Sem ajuste");
    await expect(row).toContainText("Valor efetivo: ligada");

    await row.getByRole("button", { name: `Desligar chat.voice para ${sp5Org.name}` }).click();
    const confirmOff = staffPage.getByRole("alertdialog", { name: "Desligar chat.voice?" });
    await expect(confirmOff).toContainText(`Vale só para ${sp5Org.name}`);
    await confirmOff.getByRole("button", { name: "Desligar" }).click();
    await expect(toast(staffPage, "chat.voice desligada.")).toBeVisible();
    await expect(row).toContainText("Ajuste: desligada");
    await expect(row).toContainText("Valor efetivo: desligada");
    // The environment value did not change.
    await expect(row.getByRole("switch", { name: "Valor de chat.voice no ambiente" })).toBeChecked();

    await row.getByRole("button", { name: `Remover o ajuste de chat.voice para ${sp5Org.name}` }).click();
    const clear = staffPage.getByRole("alertdialog", { name: "Remover o ajuste de chat.voice?" });
    await clear.getByRole("button", { name: "Remover ajuste" }).click();
    await expect(toast(staffPage, "Ajuste de chat.voice removido.")).toBeVisible();
    await expect(row).toContainText("Sem ajuste");
    await expect(row).toContainText("Valor efetivo: ligada");
  });
});

test.describe("workflow runs", () => {
  test("lists a suspended run of an organization and cancels it", async ({ staffPage, ownerApi, sp5Org }) => {
    const { runId } = await ownerApi.post<StartedRun>(`/v1/workflows/approval-demo/runs?organizationId=${sp5Org.id}`, { inputData: { title: unique("Admin cancel") } });
    await staffPage.goto("admin/workflows");
    const filters = staffPage.getByRole("search", { name: "Filtrar execuções" });
    await chooseOrganization(staffPage, filters.getByRole("combobox", { name: "Organização", exact: true }), sp5Org.name);
    await filters.getByRole("button", { name: "Aguardando aprovação" }).click();
    const run = staffPage.getByRole("row").filter({ hasText: runId });
    await expect(run).toContainText("Suspensa", { timeout: 30_000 });
    await expect(run).toContainText("Usuário Demo Owner");
    await expect(run).toContainText("Aguarda aprovação");

    // Workflows are named by their labels (decision 0052).
    await run.getByRole("button", { name: `Detalhes da execução ${runId} de ${APPROVAL_DEMO}` }).click();
    const details = staffPage.getByRole("dialog", { name: `Execução de ${APPROVAL_DEMO}` });
    await expect(details).toContainText(sp5Org.name);
    await expect(details.getByRole("list", { name: "Linha do tempo da execução" })).toBeVisible();
    await details.press("Escape");

    await run.getByRole("button", { name: `Cancelar a execução ${runId} de ${APPROVAL_DEMO}` }).click();
    const confirm = staffPage.getByRole("alertdialog", { name: `Cancelar a execução de ${APPROVAL_DEMO}?` });
    await expect(confirm).toContainText("A solicitação de aprovação que ela aguardava é cancelada junto");
    await confirm.getByRole("button", { name: "Cancelar execução" }).click();
    await expect(toast(staffPage, `Execução de ${APPROVAL_DEMO} cancelada.`)).toBeVisible();
    await filters.getByRole("button", { name: "Aguardando aprovação" }).click();
    await expect(staffPage.getByRole("row").filter({ hasText: runId })).toContainText("Cancelada", { timeout: 30_000 });
  });

  test("shows the no-match state for a workflow id without runs", async ({ staffPage }) => {
    await staffPage.goto("admin/workflows");
    const filters = staffPage.getByRole("search", { name: "Filtrar execuções" });
    await filters.getByRole("textbox", { name: "Workflow" }).fill("no-such-workflow");
    await filters.getByRole("button", { name: "Aplicar" }).click();
    await expect(staffPage.getByRole("heading", { name: "Nenhuma execução com esses filtros" })).toBeVisible();
  });
});

test.describe("schedules", () => {
  test("pauses a platform job after a warning, then resumes it", async ({ staffPage }) => {
    await staffPage.goto("admin/workflows");
    await staffPage.getByRole("tab", { name: "Agendamentos" }).click();
    // A platform schedule has no slug: its workflow's label names it.
    const row = staffPage.getByRole("tabpanel", { name: "Agendamentos" }).getByRole("row").filter({ hasText: CATALOG_REINDEX });
    await expect(row).toContainText("Ativo");
    await expect(row).toContainText("0 3 * * *");

    await row.getByRole("button", { name: `Pausar o agendamento de ${CATALOG_REINDEX}` }).click();
    const pause = staffPage.getByRole("alertdialog", { name: `Pausar o agendamento de ${CATALOG_REINDEX}?` });
    await expect(pause).toContainText("deixa de rodar para todas as organizações");
    await pause.getByRole("button", { name: "Pausar job da plataforma" }).click();
    await expect(toast(staffPage, `Agendamento de ${CATALOG_REINDEX} pausado.`)).toBeVisible();
    await expect(row).toContainText("Pausado");

    await row.getByRole("button", { name: `Retomar o agendamento de ${CATALOG_REINDEX}` }).click();
    const resume = staffPage.getByRole("alertdialog", { name: `Retomar o agendamento de ${CATALOG_REINDEX}?` });
    await resume.getByRole("button", { name: "Retomar agendamento" }).click();
    await expect(toast(staffPage, `Agendamento de ${CATALOG_REINDEX} retomado.`)).toBeVisible();
    await expect(row).toContainText("Ativo");
  });
});

test.describe("connectors", () => {
  test("shows an organization's connectors read only, never the secret", async ({ staffPage, ownerApi, sp5Org }) => {
    const name = unique("docs-mcp").replace(" ", "-");
    await ownerApi.post(`/v1/organizations/${sp5Org.id}/connectors`, {
      name,
      type: "mcp",
      toolPolicy: { allow: ["search"], readOnly: ["search"] },
      config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
    });
    await staffPage.goto("admin/connectors");
    await expect(staffPage.getByRole("heading", { name: "Escolha uma organização" })).toBeVisible();
    await chooseOrganization(staffPage, staffPage.getByRole("combobox", { name: "Organização", exact: true }), sp5Org.name);
    const row = staffPage.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Servidor MCP");
    await expect(row).toContainText("mcp.example.com");
    await expect(row).toContainText("Sem segredo");
    await expect(staffPage.getByText(/Somente leitura: a equipe da plataforma não altera/)).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
  });
});
