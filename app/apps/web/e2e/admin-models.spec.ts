import type { Locator, Page } from "@playwright/test";
import { expect, test, toast } from "./sp5-test.ts";

// Decision 0072: staff choose the model of each runtime role in `/admin/models`. The e2e stack runs
// fake models, so the page says so and every listed model is available. The journey puts the
// original model back at the end, so the shared runtime keeps the settings it started with.

/** The model id an option or the picker shows ("openai/gpt-6-luna — US$ 0,10 entrada · …"). */
const modelIdOf = async (locator: Locator): Promise<string> =>
  ((await locator.textContent()) ?? "").split(" — ")[0]?.trim() ?? "";

const chooseModel = async (page: Page, picker: Locator, modelId: string): Promise<void> => {
  await picker.click();
  await page.getByRole("option", { name: new RegExp(`^${modelId.replaceAll(".", "\\.")} `) }).click();
};

const saveModels = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(toast(page, "Modelos salvos.")).toBeVisible();
};

test("changes the model of quick tasks, keeps it after a reload and puts it back", async ({ staffPage }) => {
  await staffPage.goto("admin/models");
  await expect(staffPage.getByRole("heading", { level: 1, name: "Modelos" })).toBeVisible();
  await expect(staffPage.getByText(/O runtime está em modo simulado/)).toBeVisible();
  const fast = staffPage.getByRole("combobox", { name: "Tarefas rápidas" });
  const original = await modelIdOf(fast);
  expect(original).toMatch(/^[a-z]+\//);

  await fast.click();
  const other = staffPage
    .getByRole("option")
    .filter({ hasNotText: new RegExp(`^${original.replaceAll(".", "\\.")} `) })
    .first();
  const chosen = await modelIdOf(other);
  await other.click();
  await expect(fast).toContainText(chosen);
  await saveModels(staffPage);

  await staffPage.reload();
  await expect(fast).toContainText(chosen);

  await chooseModel(staffPage, fast, original);
  await expect(fast).toContainText(original);
  await saveModels(staffPage);
});
