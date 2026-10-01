import { SEED_USERS } from "@core/e2e/seed-users";
import { completeSmsChallenge, showSidebar, submitSignIn } from "@core/e2e/sign-in";
import { authFile, expect, test } from "./web-test.ts";

// SP2 spec §13 item 5. A non-staff user gets the not-found page: the admin layout streams, so the
// HTTP status of that response is 200 (task-18-19 concern 3); the UI is what the user gets.

test.describe("a user who is not platform staff", () => {
  for (const user of ["owner", "viewer"] as const) {
    test(`${user} gets the not-found page on /admin`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(user) });
      const page = await context.newPage();
      await page.goto("admin");
      await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
      await expect(page.getByText("Administração da plataforma")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Áreas da administração" })).toHaveCount(0);
      await page.goto("admin/users");
      await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
      await context.close();
    });
  }

  test("a signed-out visitor is sent to sign-in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("admin");
    await expect(page).toHaveURL(/\/pt-BR\/sign-in\?next=/);
    await context.close();
  });
});

test.describe("platform staff", () => {
  test.describe("signing in", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("signs in with the SMS code from the emulator and reaches /admin", async ({ page, emulator }) => {
      await submitSignIn(page, SEED_USERS.staff, "sign-in?next=%2Fadmin");
      await completeSmsChallenge(page, emulator);
      await expect(page.getByRole("heading", { level: 1, name: "Administração da plataforma" })).toBeVisible();
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
      const areas = page.getByRole("navigation", { name: "Áreas da administração" });
      await areas.getByRole("link", { name: "Usuários" }).click();
      await expect(page).toHaveURL(/\/pt-BR\/admin\/users$/);
      // On phones the sheet closes by itself after the navigation.
      await expect(page.getByRole("dialog", { name: "Navegação" })).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
      // During the client transition the previous area can still be mounted for a frame.
      await expect(page.getByRole("heading", { level: 2, name: "Ainda não disponível" }).first()).toBeVisible();
      await showSidebar(page);
      await page.getByRole("link", { name: "Voltar ao app" }).click();
      await expect(page).not.toHaveURL(/\/admin/);
    });
  });
});
