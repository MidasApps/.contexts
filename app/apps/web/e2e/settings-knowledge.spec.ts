import type { Page } from "@playwright/test";
import { expect, settingsPath, test, toast, unique } from "./sp5-test.ts";

// SP5 Task 16, `/settings/knowledge` as the organization's owner: upload a markdown file through
// the dialog (signed upload to the Storage Emulator, validation by the Functions trigger, ingestion
// by the agent runtime with fake embeddings), wait until it is ready, delete it. A web page cannot
// be read offline, so its ingestion fails; the page must say so.

const documentsOf = (page: Page, organizationName: string) =>
  page.getByRole("table", { name: `Documentos da base de conhecimento de ${organizationName}` });

const openAddDialog = async (page: Page) => {
  await page.getByRole("button", { name: "Adicionar documento" }).first().click();
  return page.getByRole("dialog", { name: "Adicionar documento" });
};

test("uploads a markdown file, waits until it is indexed and deletes it", async ({ page, sp5Org }) => {
  test.setTimeout(300_000);
  const fileName = `${unique("policy").replace(" ", "-")}.md`;
  await page.goto(settingsPath(sp5Org.id, "knowledge"));
  await expect(page.getByRole("heading", { level: 1, name: "Base de conhecimento" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nenhum documento nesta coleção" })).toBeVisible();

  const dialog = await openAddDialog(page);
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(dialog.getByText("Escolha um arquivo.")).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from("# Refund policy\n\nRefunds are accepted within 30 days of purchase with the receipt.\n"),
  });
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(toast(page, `Indexação de ${fileName} iniciada.`)).toBeVisible({ timeout: 120_000 });

  const row = documentsOf(page, sp5Org.name).getByRole("row").filter({ hasText: fileName });
  await expect(row).toBeVisible({ timeout: 120_000 });
  await expect(row).toContainText("Arquivo enviado");
  await expect(row).toContainText("Pronto", { timeout: 120_000 });

  await row.getByRole("button", { name: `Excluir ${fileName}` }).click();
  await page
    .getByRole("alertdialog", { name: `Excluir ${fileName}?` })
    .getByRole("button", { name: "Excluir documento" })
    .click();
  await expect(toast(page, `${fileName} foi excluído.`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("refuses a page that is not https before sending anything", async ({ page, sp5Org }) => {
  await page.goto(settingsPath(sp5Org.id, "knowledge"));
  const dialog = await openAddDialog(page);
  await dialog.getByRole("tab", { name: "Página da web" }).click();
  await dialog.getByRole("textbox", { name: /^Endereço da página/ }).fill("http://example.com/page");
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(dialog.getByText("Informe um endereço completo que comece com https://.")).toBeVisible();
});

const addPage = async (page: Page, url: string): Promise<void> => {
  const dialog = await openAddDialog(page);
  await dialog.getByRole("tab", { name: "Página da web" }).click();
  await dialog.getByRole("textbox", { name: /^Endereço da página/ }).fill(url);
  await dialog.getByRole("button", { name: "Adicionar" }).click();
  await expect(toast(page, /Indexação de .* iniciada\./)).toBeVisible();
};

test("adds an https page, waits until it is indexed and deletes it", async ({ page, sp5Org }) => {
  // A fixture host of the fake page reader (`AI_MODE=fake`): no network.
  test.setTimeout(180_000);
  await page.goto(settingsPath(sp5Org.id, "knowledge"));
  await addPage(page, "https://docs.example.com/security");
  const row = documentsOf(page, sp5Org.name).getByRole("row").filter({ hasText: "Security overview" });
  await expect(row).toContainText("Página da web", { timeout: 120_000 });
  await expect(row).toContainText("Pronto", { timeout: 120_000 });
  await expect(page.getByRole("list", { name: "Indexações em andamento" })).toHaveCount(0);
  await row.getByRole("button", { name: "Excluir Security overview" }).click();
  await page
    .getByRole("alertdialog", { name: "Excluir Security overview?" })
    .getByRole("button", { name: "Excluir documento" })
    .click();
  await expect(row).toHaveCount(0);
});

test("shows that a page could not be indexed, with its reference, a retry and dismiss", async ({ page, sp5Org }) => {
  // Known item 5: the runtime's SSRF guard refuses an internal host, so the run fails before a
  // document exists; the notice follows the run and turns into a failure instead of "Indexando …"
  // forever.
  test.setTimeout(180_000);
  await page.goto(settingsPath(sp5Org.id, "knowledge"));
  await addPage(page, "https://wiki.internal/handbook");
  const notices = page.getByRole("list", { name: "Indexações em andamento" });
  const failure = notices.getByRole("alert").filter({ hasText: /Não foi possível indexar/ });
  await expect(failure).toBeVisible({ timeout: 120_000 });
  await expect(failure.getByText(/^Referência: /)).toBeVisible();
  await expect(notices.getByText(/^Indexando /)).toHaveCount(0);
  await expect(failure.getByRole("button", { name: /^Tentar indexar .* de novo$/ })).toBeVisible();
  await failure.getByRole("button", { name: /^Dispensar o aviso de / }).click();
  await expect(failure).toHaveCount(0);
  await expect(documentsOf(page, sp5Org.name).getByRole("row").filter({ hasText: "wiki.internal" })).toHaveCount(0);
});
