import type { Page } from "@playwright/test";
import { expect, settingsPath, test, toast, unique } from "./sp5-test.ts";

/** The connector's table row (the toast is a list item with the same name, so not `entry`). */
const rowOf = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });

// SP5 Task 16, `/settings/connectors` as the organization's owner: create an MCP connector, edit
// its tool policy, set and replace its write-only secret (never shown again), disable it and
// delete it. Nothing reaches the external server: the page has no connection test.

const SECRET = "e2e-secret-token-value-123";

test("creates, edits, sets the secret of, disables and deletes a connector", async ({ page, sp5Org }) => {
  test.setTimeout(180_000);
  const name = unique("Tickets");
  await page.goto(settingsPath(sp5Org.id, "connectors"));
  await expect(page.getByRole("heading", { level: 1, name: "Conectores" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nenhum conector" })).toBeVisible();

  await page.getByRole("button", { name: "Novo conector" }).first().click();
  const editor = page.getByRole("dialog", { name: "Novo conector" });
  await editor.getByRole("textbox", { name: /^Nome/ }).fill(name);
  await editor.getByRole("combobox", { name: /^Tipo/ }).click();
  await page.getByRole("option", { name: "Servidor MCP" }).click();
  await editor.getByRole("textbox", { name: /^URL do servidor/ }).fill("https://mcp.example.com/mcp");
  await editor.getByRole("textbox", { name: /^Hosts permitidos/ }).fill("mcp.example.com");
  await editor.getByRole("textbox", { name: /^Ferramentas permitidas/ }).fill("tickets.list\ntickets.create");
  await editor
    .getByRole("group", { name: "Ferramentas que rodam sem aprovação" })
    .getByRole("checkbox", { name: "tickets.list" })
    .check();
  await editor.getByRole("button", { name: "Criar conector" }).click();
  await expect(toast(page, `Conector ${name} criado.`)).toBeVisible();
  const row = rowOf(page, name);
  await expect(row).toContainText("Ativo");
  await expect(row).toContainText("Não definido");
  await expect(row).toContainText("2 ferramentas");

  await row.getByRole("button", { name: `Editar ${name}` }).click();
  const edit = page.getByRole("dialog", { name: `Editar ${name}` });
  await edit
    .getByRole("textbox", { name: /^Ferramentas permitidas/ })
    .fill("tickets.list\ntickets.create\ntickets.close");
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(toast(page, `Conector ${name} atualizado.`)).toBeVisible();
  await expect(row).toContainText("3 ferramentas");

  await row.getByRole("button", { name: `Definir o segredo de ${name}` }).click();
  const secret = page.getByRole("dialog", { name: `Definir o segredo de ${name}` });
  await secret.getByRole("textbox", { name: /Token de acesso/ }).fill(SECRET);
  await secret.getByRole("button", { name: "Salvar segredo" }).click();
  await expect(toast(page, `Segredo de ${name} salvo.`)).toBeVisible();
  await expect(row).toContainText("Definido");
  await row.getByRole("button", { name: `Substituir o segredo de ${name}` }).click();
  const replace = page.getByRole("dialog", { name: `Substituir o segredo de ${name}` });
  // Write-only: the field starts empty and the stored value is never rendered.
  await expect(replace.getByRole("textbox", { name: /Token de acesso/ })).toHaveValue("");
  await replace.getByRole("button", { name: "Cancelar" }).click();
  await page.reload();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  expect(await page.content()).not.toContain(SECRET);

  await rowOf(page, name)
    .getByRole("button", { name: `Desativar ${name}` })
    .click();
  await page
    .getByRole("alertdialog", { name: `Desativar ${name}?` })
    .getByRole("button", { name: "Desativar" })
    .click();
  await expect(toast(page, `Conector ${name} desativado.`)).toBeVisible();
  await expect(rowOf(page, name)).toContainText("Desativado");

  await rowOf(page, name)
    .getByRole("button", { name: `Excluir ${name}` })
    .click();
  await page
    .getByRole("alertdialog", { name: `Excluir ${name}?` })
    .getByRole("button", { name: "Excluir conector" })
    .click();
  await expect(toast(page, `Conector ${name} excluído.`)).toBeVisible();
  await expect(rowOf(page, name)).toHaveCount(0);
});
