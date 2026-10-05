import { expectNoAxeViolations } from "@core/e2e/axe";
import { expect, test } from "./web-test.ts";

// The user guide (decision 0073): read signed out, pages linked to each other, Portuguese only.
test.describe("user guide", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("opens signed out and goes from the index to a page and back", async ({ page }) => {
    await page.goto("docs");
    await expect(page.getByRole("heading", { level: 1, name: "Documentação do app" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("main").getByRole("link", { name: "Primeiros passos" }).first().click();
    await expect(page).toHaveURL(/\/pt-BR\/docs\/getting-started$/u);
    await expect(page.getByRole("heading", { level: 1, name: "Primeiros passos" })).toBeVisible();
    await expect(page).toHaveTitle(/Primeiros passos/u);

    await page.getByRole("navigation", { name: "Página anterior e próxima" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/pt-BR\/docs$/u);
  });

  test("shows the Portuguese page with a notice in another language", async ({ page }) => {
    await page.goto("/en-US/docs/chat");
    await expect(page.getByText("This documentation is only available in Portuguese.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveAttribute("lang", "pt-BR");
  });

  test("answers not found for a page outside the guide", async ({ page }) => {
    await page.goto("docs/nope");
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  });
});
