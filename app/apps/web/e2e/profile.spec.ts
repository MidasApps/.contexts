import type { Page } from "@playwright/test";
import { SEED_USERS } from "@core/e2e/seed-users";
import { accountMenu, signInThroughUi } from "@core/e2e/sign-in";
import { authFile, expect, test, type FreshUser } from "./web-test.ts";

// SP2 spec §13 item 3. Every test changes its own fresh account (createUser), so parallel browser
// projects never race on preferences or sessions and nothing needs resetting afterwards.
test.use({ storageState: { cookies: [], origins: [] } });

const signInFresh = async (page: Page, createUser: (args: { label: string; organizations: { id: string }[] }) => Promise<FreshUser>, organizationId: string) => {
  const user = await createUser({ label: "Profile", organizations: [{ id: organizationId }] });
  await signInThroughUi(page, user);
  return user;
};

/** Picks an option of a searchable picker (time zone, currency): trigger → search → option. */
const pick = async (page: Page, args: { field: RegExp; search: string; query: string; option: RegExp }): Promise<void> => {
  await page.getByRole("combobox", { name: args.field }).click();
  const dialog = page.getByRole("dialog", { name: args.search });
  await dialog.getByRole("combobox", { name: args.search }).fill(args.query);
  await dialog.getByRole("option", { name: args.option }).click();
};

test("edits the display name", async ({ page, world, createUser }) => {
  const user = await signInFresh(page, createUser, world.alpha.id);
  await page.goto("profile/account");
  const field = page.getByRole("textbox", { name: /Nome de exibição/ });
  await expect(field).toHaveValue(user.displayName);
  await field.fill(`${user.displayName} Renamed`);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas").first()).toBeVisible();
  await expect(await accountMenu(page, `${user.displayName} Renamed`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("textbox", { name: /Nome de exibição/ })).toHaveValue(`${user.displayName} Renamed`);
});

test("changes the language: the URL locale and the copy switch", async ({ page, world, createUser }) => {
  await signInFresh(page, createUser, world.alpha.id);
  await page.goto("profile/preferences");
  await page.getByRole("combobox", { name: /^Idioma/ }).click();
  await page.getByRole("option", { name: "English (United States)" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/en-US\/profile\/preferences$/);
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
});

test("changes time zone and currency; the example page shows the new display zone", async ({ page, world, createUser }) => {
  await signInFresh(page, createUser, world.alpha.id);
  const modulePage = `o/${world.alpha.id}/p/${world.alpha.projects.launch.id}/m/example`;
  await page.goto(modulePage);
  await expect(page.getByText("America/Sao_Paulo").first()).toBeVisible();

  await page.goto("profile/preferences");
  await pick(page, { field: /^Fuso horário/, search: "Buscar fuso horário", query: "Tokyo", option: /Asia\/Tokyo/ });
  await pick(page, { field: /^Moeda/, search: "Buscar moeda", query: "USD", option: /^USD/ });
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas").first()).toBeVisible();

  await page.goto(modulePage);
  await expect(page.getByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeVisible();
  await expect(page.getByText("Asia/Tokyo").first()).toBeVisible();
  await page.goto("profile/preferences");
  await expect(page.getByRole("combobox", { name: /^Moeda/ })).toContainText("USD");
  await expect(page.getByRole("combobox", { name: /^Fuso horário/ })).toContainText("Asia/Tokyo");
});

test.describe("theme", () => {
  test.use({ colorScheme: "light" });

  test("applies the chosen theme at once and keeps it after a reload", async ({ page, world, createUser }) => {
    await signInFresh(page, createUser, world.alpha.id);
    await page.goto("profile/preferences");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    const saved = page.waitForResponse((response) => response.url().endsWith("/v1/me") && response.request().method() === "PATCH" && response.ok());
    await page.getByRole("radio", { name: "Escuro" }).check();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await saved;
    await page.reload();
    await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });
});

test("revokes another session, which then has to sign in again", async ({ page, browser, world, createUser }) => {
  const user = await signInFresh(page, createUser, world.alpha.id);
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const otherPage = await other.newPage();
  await signInThroughUi(otherPage, user);

  await page.goto("profile/sessions");
  const revoke = page.getByRole("button", { name: /^Revogar sessão de / });
  await expect(revoke).toHaveCount(1);
  await revoke.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revogar sessão" }).click();
  await expect(page.getByText(/^Sessão de .+ revogada\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Revogar sessão de / })).toHaveCount(0);
  await expect(page.getByText("Este dispositivo", { exact: true })).toBeVisible();

  await otherPage.goto(`o/${world.alpha.id}`);
  await expect(otherPage).toHaveURL(/\/pt-BR\/sign-in/);
  await other.close();
});

const PROFILE_SECTION_LINKS = [
  ["Preferências", "preferences"],
  ["Segurança", "security"],
  ["Sessões", "sessions"],
  ["Notificações", "notifications"],
  ["Conta", "account"],
] as const;

test.describe("section navigation", () => {
  test.use({ storageState: authFile("owner") });

  // Task 22–23 exploration saw 404s on `?_rsc=` prefetches of the sibling profile sections. Guard:
  // walking the profile from the account menu and its section navigation (client navigations with
  // prefetches) and loading each section directly answers no request with a 4xx.
  test("every profile section and its prefetches answer without a 404", async ({ page, world }) => {
    const failures: string[] = [];
    let rscRequests = 0;
    page.on("response", (response) => {
      if (response.request().headers()["rsc"] !== undefined) rscRequests += 1;
      if (response.status() >= 400 && response.status() < 500) failures.push(`${String(response.status())} ${response.url()}`);
    });
    await page.goto(`o/${world.alpha.id}`);
    await (await accountMenu(page, SEED_USERS.owner.displayName)).click();
    await page.getByRole("menuitem", { name: "Conta" }).click();
    await expect(page).toHaveURL(/\/profile\/account$/);
    const sections = page.getByRole("navigation", { name: "Seções do perfil" });
    for (const [name, section] of PROFILE_SECTION_LINKS) {
      await sections.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/profile/${section}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    for (const [, section] of PROFILE_SECTION_LINKS) {
      await page.goto(`profile/${section}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    expect(rscRequests).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
