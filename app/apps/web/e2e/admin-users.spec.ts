import type { Page } from "@playwright/test";
import { SEED_USERS } from "@core/e2e/seed-users";
import { completeSmsChallenge, showSidebar, submitSignIn } from "@core/e2e/sign-in";
import { expect, openAs, test, toast } from "./sp5-test.ts";

// SP5 Task 16: `/admin/users`: search by name, e-mail and id, support access (impersonation)
// started for a seeded user and ended from the team's session list. What happens to the tab after
// "open the app as this user" survives a reload and "leave" returns to the staff account (decision
// 0047); that journey signs staff in on its own session so the shared staff session is untouched.

const viewer = SEED_USERS.viewer;
const REASON_PATTERN = "E2E support ticket";

/** Picks the viewer in the search and starts a support session in Alpha Org with `reason`. */
const startSession = async (page: Page, organizationName: string, reason: string): Promise<void> => {
  const search = page.getByRole("region", { name: "Buscar usuário" });
  await search.getByRole("searchbox", { name: "Nome, e-mail ou id" }).fill(viewer.email);
  await search.getByRole("button", { name: "Buscar" }).click();
  await search.getByRole("button", { name: `Selecionar ${viewer.displayName} para o acesso de suporte` }).click();
  const start = page.getByRole("region", { name: "Iniciar acesso como usuário" });
  await start.getByRole("combobox", { name: "Organização", exact: true }).click();
  await page.getByRole("option", { name: organizationName }).click();
  await start.getByRole("textbox", { name: "Motivo" }).fill(reason);
  await start.getByRole("spinbutton", { name: "Duração em minutos" }).fill("15");
  await start.getByRole("button", { name: "Iniciar sessão" }).click();
  await expect(toast(page, "Sessão de suporte iniciada.")).toBeVisible();
};

test.describe("user search", () => {
  test("finds a user by e-mail, by name prefix and shows the empty result", async ({ staffPage }) => {
    await staffPage.goto("admin/users");
    const search = staffPage.getByRole("region", { name: "Buscar usuário" });
    await expect(search.getByRole("heading", { name: "Busque um usuário" })).toBeVisible();
    const box = search.getByRole("searchbox", { name: "Nome, e-mail ou id" });

    await box.fill(viewer.email);
    await search.getByRole("button", { name: "Buscar" }).click();
    const results = search.getByRole("table", { name: "Usuários encontrados" });
    await expect(results.getByRole("row").filter({ hasText: viewer.email })).toHaveCount(1);

    await box.fill("vera v");
    await search.getByRole("button", { name: "Buscar" }).click();
    await expect(results.getByRole("row").filter({ hasText: viewer.displayName })).toHaveCount(1);

    await box.fill("zz-nobody-has-this-name");
    await search.getByRole("button", { name: "Buscar" }).click();
    await expect(search.getByRole("heading", { name: "Nenhum usuário encontrado" })).toBeVisible();
  });
});

test.describe("support access", () => {
  test("starts a session as a user, lists it for the team and ends it from the list", async ({ staffPage, world }) => {
    await staffPage.goto("admin/users");
    const search = staffPage.getByRole("region", { name: "Buscar usuário" });
    await search.getByRole("searchbox", { name: "Nome, e-mail ou id" }).fill(viewer.email);
    await search.getByRole("button", { name: "Buscar" }).click();
    await search.getByRole("button", { name: `Selecionar ${viewer.displayName} para o acesso de suporte` }).click();

    const start = staffPage.getByRole("region", { name: "Iniciar acesso como usuário" });
    await expect(start.getByText(viewer.displayName).first()).toBeVisible();
    await start.getByRole("combobox", { name: "Organização", exact: true }).click();
    await staffPage.getByRole("option", { name: world.alpha.name }).click();
    await start.getByRole("textbox", { name: "Motivo" }).fill("E2E support ticket 4711: check the viewer's settings.");
    await start.getByRole("spinbutton", { name: "Duração em minutos" }).fill("15");
    await start.getByRole("button", { name: "Iniciar sessão" }).click();
    await expect(toast(staffPage, "Sessão de suporte iniciada.")).toBeVisible();

    const tab = staffPage.getByRole("region", { name: "Sessão aberta nesta aba" });
    await expect(tab.getByText(world.alpha.name)).toBeVisible();
    await expect(tab.getByRole("button", { name: "Abrir o app como este usuário" })).toBeVisible();

    const sessions = staffPage.getByRole("region", { name: "Sessões de acesso de suporte" });
    const row = sessions.getByRole("row").filter({ hasText: "E2E support ticket 4711" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(SEED_USERS.staff.displayName);
    await expect(row).toContainText(viewer.displayName);
    await expect(row).toContainText("Aberta");

    await row.getByRole("button", { name: `Encerrar a sessão de ${SEED_USERS.staff.displayName} como ${viewer.displayName}` }).click();
    const confirm = staffPage.getByRole("alertdialog", { name: "Encerrar esta sessão de suporte?" });
    await confirm.getByRole("button", { name: "Encerrar sessão" }).click();
    await expect(toast(staffPage, `Sessão de ${SEED_USERS.staff.displayName} encerrada.`)).toBeVisible();
    await expect(row).toHaveCount(0);

    await sessions.getByRole("combobox", { name: "Mostrar" }).click();
    await staffPage.getByRole("option", { name: "Todas, mais recentes primeiro" }).click();
    await expect(sessions.getByRole("row").filter({ hasText: "E2E support ticket 4711" }).first()).toContainText("Encerrada");
  });

  test("refuses a reason that is too short", async ({ staffPage }) => {
    await staffPage.goto("admin/users");
    const search = staffPage.getByRole("region", { name: "Buscar usuário" });
    await search.getByRole("searchbox", { name: "Nome, e-mail ou id" }).fill(viewer.email);
    await search.getByRole("button", { name: "Buscar" }).click();
    await search.getByRole("button", { name: `Selecionar ${viewer.displayName} para o acesso de suporte` }).click();
    const start = staffPage.getByRole("region", { name: "Iniciar acesso como usuário" });
    await start.getByRole("textbox", { name: "Motivo" }).fill("short");
    await start.getByRole("button", { name: "Iniciar sessão" }).click();
    await expect(start.getByText("Explique o motivo com 10 a 500 caracteres.")).toBeVisible();
    await expect(start.getByText("Escolha a organização.")).toBeVisible();
  });
});

test.describe("support access in the tab", () => {
  test("opens the app as the user, survives a reload and leaves back to the staff account", async ({ browser, emulator, world }) => {
    test.setTimeout(180_000);
    const staff = await openAs(browser, { cookies: [], origins: [] });
    const page = staff.page;
    // The Auth Emulator does not implement the reCAPTCHA Enterprise config the SDK asks for when it
    // sends the SMS (501); a real project answers it. Nothing else may reach the console.
    staff.guard.allow(/status of 501 \(Not Implemented\)/);
    await submitSignIn(page, SEED_USERS.staff, "sign-in?next=%2Fadmin%2Fusers");
    await completeSmsChallenge(page, emulator);
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
    const reason = `${REASON_PATTERN} 5150: reload and leave.`;
    await startSession(page, world.alpha.name, reason);

    await page.getByRole("region", { name: "Sessão aberta nesta aba" }).getByRole("button", { name: "Abrir o app como este usuário" }).click();
    // The banner names the user (and the organization when known) the staff member is viewing as.
    const banner = page.getByText(new RegExp(`^Você está vendo o app como ${viewer.displayName}\\b.*, em modo somente leitura`));
    await expect(banner).toBeVisible();
    await showSidebar(page);
    await expect(page.getByRole("button", { name: `${viewer.displayName}, menu da conta` })).toBeVisible();

    // A reload restores the user, not the staff account (decision 0047).
    await page.reload();
    await expect(banner).toBeVisible();
    await showSidebar(page);
    await expect(page.getByRole("button", { name: `${viewer.displayName}, menu da conta` })).toBeVisible();

    // Leaving ends the session and returns to staff without a new sign-in.
    await page.getByRole("button", { name: "Sair do modo suporte" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/admin\/users$/);
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    const sessions = page.getByRole("region", { name: "Sessões de acesso de suporte" });
    await sessions.getByRole("combobox", { name: "Mostrar" }).click();
    await page.getByRole("option", { name: "Todas, mais recentes primeiro" }).click();
    await expect(sessions.getByRole("row").filter({ hasText: reason }).first()).toContainText("Encerrada");

    // Staff stays staff after another reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await staff.close();
  });
});
