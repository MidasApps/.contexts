import type { Page } from "@playwright/test";
import { expectNoAxeViolations } from "@core/e2e/axe";
import { signInThroughUi } from "@core/e2e/sign-in";
import { expect, test } from "./desktop-test.ts";

// SP2 spec §13 item 7: journeys 1–3 on the desktop frontend (TanStack Router, no locale segment).
// Browser mode keeps the session in memory, so after signing in the tests navigate inside the app
// (a full page load is a fresh start, like reopening the app without a keychain).

const accountMenu = (page: Page, name: string) => page.getByRole("button", { name: `${name}, menu da conta` });

/** Opens a page through the command palette, the keyboard route every shell offers. */
const openFromPalette = async (page: Page, option: string): Promise<void> => {
  // A previous dialog must be fully gone, or the new palette opens under its closing overlay.
  await expect(page.locator("[data-slot=dialog-overlay]")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
  await palette.getByRole("combobox", { name: "Buscar comando ou página" }).fill(option);
  await palette.getByRole("option", { name: option, exact: true }).click();
};

test("signs in, lands in the last organization and signs out", async ({ page, world, createUser }) => {
  const user = await createUser({ label: "Desk", organizations: [{ id: world.beta.id }, { id: world.alpha.id }] });
  await page.goto(`/o/${world.alpha.id}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expectNoAxeViolations(page);
  await signInThroughUi(page, user, "/sign-in");
  await expect(page).toHaveURL(new RegExp(`/o/${world.alpha.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: world.alpha.name })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expectNoAxeViolations(page);

  await accountMenu(page, user.displayName).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
});

test("switches organization and project from the sidebar", async ({ page, world, createUser }) => {
  const user = await createUser({ label: "DeskSwitch", organizations: [{ id: world.beta.id }, { id: world.alpha.id }] });
  await signInThroughUi(page, user, "/sign-in");
  await page.getByRole("button", { name: `${world.alpha.name}, trocar de organização` }).click();
  await page.getByRole("menuitemradio", { name: world.beta.name }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${world.beta.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: world.beta.name })).toBeVisible();

  await page.getByRole("button", { name: `${world.beta.name}, trocar de organização` }).click();
  await page.getByRole("menuitemradio", { name: world.alpha.name }).click();
  await page.getByRole("main").getByRole("link", { name: world.alpha.projects.launch.name }).click();
  await page.getByRole("button", { name: `${world.alpha.projects.launch.name}, trocar de projeto` }).click();
  await page.getByRole("menuitemradio", { name: world.alpha.projects.growth.name }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${world.alpha.projects.growth.id}$`));
  await expect(page.getByRole("navigation", { name: "Trilha de navegação" }).getByRole("link", { name: world.alpha.projects.growth.name })).toBeVisible();
  await page.getByRole("navigation", { name: "Navegação" }).getByRole("link", { name: "Exemplo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeVisible();
});

test("edits the profile: display name, time zone and language", async ({ page, world, createUser }) => {
  const user = await createUser({ label: "DeskProfile", organizations: [{ id: world.alpha.id }] });
  await signInThroughUi(page, user, "/sign-in");

  await openFromPalette(page, "Conta");
  const name = page.getByRole("textbox", { name: /Nome de exibição/ });
  await expect(name).toHaveValue(user.displayName);
  await name.fill(`${user.displayName} Desk`);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(accountMenu(page, `${user.displayName} Desk`)).toBeVisible();

  await openFromPalette(page, "Preferências");
  await page.getByRole("combobox", { name: /^Fuso horário/ }).click();
  const zones = page.getByRole("dialog", { name: "Buscar fuso horário" });
  await zones.getByRole("combobox", { name: "Buscar fuso horário" }).fill("Tokyo");
  await zones.getByRole("option", { name: /Asia\/Tokyo/ }).click();
  await page.getByRole("combobox", { name: /^Idioma/ }).click();
  await page.getByRole("option", { name: "English (United States)" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Preferences" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expectNoAxeViolations(page);

  // Profile pages sit outside any organization: the switcher offers to choose one.
  await page.getByRole("button", { name: /, switch organization$/ }).click();
  await page.getByRole("menuitemradio", { name: world.alpha.name }).click();
  await page.getByRole("main").getByRole("link", { name: world.alpha.projects.launch.name }).click();
  await page.getByRole("navigation", { name: "Navigation" }).getByRole("link", { name: "Example" }).click();
  await expect(page.getByText("Asia/Tokyo").first()).toBeVisible();
});
