import { SEED_USERS } from "@core/e2e/seed-users";
import { closeSidebarSheet, completeSmsChallenge, showSidebar, submitSignIn } from "@core/e2e/sign-in";
import { authFile, expect, test } from "./web-test.ts";

// Decision 0077: `/admin` is the administration of every signed-in user; only its platform console
// (`/admin/platform`) is staff's. A non-staff user gets the not-found page there: the layout
// streams, so the HTTP status of that response is 200 (task-18-19 concern 3); the UI is what the
// user gets.

test.describe("a user who is not platform staff", () => {
  for (const user of ["owner", "viewer"] as const) {
    test(`${user} opens the organization's administration but not the platform console`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(user) });
      const page = await context.newPage();
      await page.goto("admin");
      await expect(page).toHaveURL(/\/pt-BR\/admin\/o\/[^/]+\/general$/);
      await expect(page.getByRole("heading", { level: 1, name: "Geral" })).toBeVisible();
      await showSidebar(page);
      const sections = page.getByRole("navigation", { name: "Seções da administração" });
      await expect(sections.getByRole("link", { name: "Abrir a aplicação" })).toBeVisible();
      await expect(sections.getByRole("link", { name: "Console da plataforma" })).toHaveCount(0);
      await closeSidebarSheet(page);
      for (const area of ["admin/platform", "admin/platform/users"]) {
        await page.goto(area);
        await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
      }
      await context.close();
    });
  }

  test("a signed-out visitor is sent to sign-in, which says it leads to the administration", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("admin");
    await expect(page).toHaveURL(/\/pt-BR\/sign-in\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar na administração" })).toBeVisible();
    await context.close();
  });
});

test.describe("platform staff", () => {
  test.describe("signing in", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("signs in with the SMS code from the emulator and reaches the platform console", async ({
      page,
      emulator,
    }) => {
      await submitSignIn(page, SEED_USERS.staff, "sign-in?next=%2Fadmin");
      await completeSmsChallenge(page, emulator);
      await expect(page.getByRole("heading", { level: 1, name: "Console da plataforma" })).toBeVisible();
      await expect(page.getByRole("banner").getByText("Equipe da plataforma")).toBeVisible();
    });

    test("a wrong SMS code is refused", async ({ page }) => {
      await submitSignIn(page, SEED_USERS.staff);
      await page.getByRole("button", { name: "Enviar código por SMS" }).click();
      await page.getByRole("textbox", { name: "Código de verificação" }).fill("000000");
      await page.getByRole("button", { name: "Verificar" }).click();
      await expect(page.getByText("Código inválido ou expirado. Confira e tente de novo.")).toBeVisible();
    });
  });

  test.describe("signed in", () => {
    test.use({ storageState: authFile("staff") });

    test("opens an admin area and goes back to the app", async ({ page }) => {
      await page.goto("admin");
      await showSidebar(page);
      const areas = page.getByRole("navigation", { name: "Seções da administração" });
      await areas.getByRole("link", { name: "Usuários" }).click();
      await expect(page).toHaveURL(/\/pt-BR\/admin\/platform\/users$/);
      // On phones the sheet closes by itself after the navigation.
      await expect(page.getByRole("dialog", { name: "Navegação" })).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
      // The area renders its content (SP5), not the empty slot SP2 had here.
      await expect(page.getByRole("search", { name: "Buscar usuário" })).toBeVisible();
      await expect(page.getByText("Ainda não disponível")).toHaveCount(0);
      await showSidebar(page);
      await areas.getByRole("link", { name: "Abrir a aplicação" }).click();
      await expect(page).not.toHaveURL(/\/admin/);
    });
  });
});
