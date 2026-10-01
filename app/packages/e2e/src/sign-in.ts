import { expect, type Page } from "@playwright/test";
import type { EmulatorAuth } from "./emulator.ts";

export type Credentials = { email: string; password: string };

// Identity Toolkit call the Firebase SDK makes when it sends the SMS of a second-factor sign-in.
const isMfaStart = (url: string): boolean => url.includes("/accounts/mfaSignIn:start");

/** Fills and submits the e-mail/password form on screen (sign-in page or the invite page's). */
export const fillSignInForm = async (page: Page, user: Credentials): Promise<void> => {
  await page.getByRole("textbox", { name: "E-mail" }).fill(user.email);
  await page.getByRole("textbox", { name: "Senha" }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
};

/** Opens the shared sign-in view (pt-BR copy) and submits it; the caller asserts where it lands. */
export const submitSignIn = async (page: Page, user: Credentials, signInPath = "sign-in"): Promise<void> => {
  await page.goto(signInPath);
  await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  await fillSignInForm(page, user);
};

/**
 * Answers the SMS second factor after the password step: asks for the code, reads it from the
 * Auth Emulator by the `sessionInfo` of this sign-in's MFA start, and verifies it.
 */
export const completeSmsChallenge = async (page: Page, auth: EmulatorAuth): Promise<void> => {
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  const started = page.waitForResponse((response) => isMfaStart(response.url()) && response.ok());
  await page.getByRole("button", { name: "Enviar código por SMS" }).click();
  const answer = (await (await started).json()) as { phoneResponseInfo?: { sessionInfo?: string } };
  const sessionInfo = answer.phoneResponseInfo?.sessionInfo ?? "";
  let code: string | undefined;
  await expect.poll(async () => (code = await auth.smsCodeFor(sessionInfo))).toMatch(/^\d{6}$/);
  await page.getByRole("textbox", { name: "Código de verificação" }).fill(code ?? "");
  await page.getByRole("button", { name: "Verificar" }).click();
};

const sidebarToggle = (page: Page) => page.getByRole("button", { name: "Mostrar ou ocultar a barra lateral" });

/** Below 768 px (`md`) the sidebar is a sheet behind the topbar toggle (SP2 spec §9). */
const PHONE_MAX_WIDTH = 767;

/**
 * Makes the sidebar visible: on phones it opens the sheet (a dialog titled "Navegação"); on wider
 * screens it expands the sidebar only if the user collapsed it (the toggle's aria-expanded; on
 * phones that attribute keeps the desktop state, so the sheet itself is checked instead).
 */
export const showSidebar = async (page: Page): Promise<void> => {
  const toggle = sidebarToggle(page);
  await expect(toggle).toBeVisible();
  if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= PHONE_MAX_WIDTH) {
    const sheet = page.getByRole("dialog", { name: "Navegação" });
    if (!(await sheet.isVisible())) await toggle.click();
    await expect(sheet).toBeVisible();
    return;
  }
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
};

/**
 * Closes the phone sidebar sheet if it is open (it is modal: the page behind is inert). The shell
 * closes it itself when the path changes; this is for search-only changes (the unit picker) and
 * for a sheet a test opened just to look. Retried until it stays closed (closing animation).
 */
export const closeSidebarSheet = async (page: Page): Promise<void> => {
  const sheet = page.getByRole("dialog", { name: "Navegação" });
  await expect(async () => {
    if (await sheet.isVisible()) await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 1_000 });
  }).toPass();
};

/** The account menu trigger in the sidebar footer, with the sidebar made visible first. */
export const accountMenu = async (page: Page, displayName: string) => {
  await showSidebar(page);
  return page.getByRole("button", { name: `${displayName}, menu da conta` });
};

// `/`, `/pt-BR`, `/en-US/`, …: the home route, which immediately replaces itself with the last context.
const HOME_PATH = /^\/(?:[a-z]{2}-(?:[A-Z]{2}|\d{3}))?\/?$/;

/**
 * Signs in through the UI and waits until the user area has landed: off the sign-in page and past
 * the home redirect (a `goto` fired during that client navigation is aborted by Firefox), with the
 * page's h1 and the shell's topbar up (on phones the account menu sits in the closed sheet).
 */
export const signInThroughUi = async (page: Page, user: Credentials, signInPath = "sign-in"): Promise<void> => {
  await submitSignIn(page, user, signInPath);
  await page.waitForURL((url) => !url.pathname.endsWith("/sign-in") && !HOME_PATH.test(url.pathname));
  await expect(sidebarToggle(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
};
