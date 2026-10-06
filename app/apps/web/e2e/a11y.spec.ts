import { expectNoAxeViolations } from "@core/e2e/axe";
import { SEED_USERS, type World } from "@core/e2e/seed-users";
import { completeSmsChallenge, submitSignIn } from "@core/e2e/sign-in";
import type { Page } from "@playwright/test";
import { openAs } from "./sp5-test.ts";
import { authFile, expect, test } from "./web-test.ts";

// SP2 spec §13 item 6: axe (WCAG 2.2 AA tags) clean on every shell page, in both themes, in pt-BR,
// en-US and es-419. Each page is checked once it settled: its heading is up and nothing is loading.
// Entry and error states (invite, not found, the second-factor step) and open overlays (a
// confirmation, the second-factor enrollment, the support access banner) are checked too.

type PageCase = { name: string; path: (world: World) => string; heading: string | RegExp };

const org = (world: World): string => `o/${world.alpha.id}`;
const project = (world: World): string => `${org(world)}/p/${world.alpha.projects.launch.id}`;

const SETTINGS: [string, string][] = [
  ["general", "Geral"],
  ["members", "Membros"],
  ["invitations", "Convites"],
  ["roles", "Papéis"],
  ["units", "Unidades"],
  ["api-keys", "Chaves de API"],
  ["devices", "Dispositivos"],
  ["connectors", "Conectores"],
  ["agents", "Agentes"],
  ["usage", "Uso"],
];
const PROFILE: [string, string][] = [
  ["account", "Conta"],
  ["preferences", "Preferências"],
  ["security", "Segurança"],
  ["sessions", "Sessões"],
  ["notifications", "Notificações"],
];

const USER_PAGES: PageCase[] = [
  { name: "organization home", path: org, heading: "Alpha Org" },
  { name: "project home", path: project, heading: "Alpha Launch" },
  {
    name: "project home with a unit",
    path: (world) => `${project(world)}?unit=${world.alpha.units.north.id}`,
    heading: "Alpha Launch",
  },
  { name: "module page", path: (world) => `${project(world)}/m/example`, heading: "Módulo de exemplo" },
  { name: "organizations", path: () => "organizations", heading: "Organizações" },
  ...SETTINGS.map(([section, heading]) => ({
    name: `settings ${section}`,
    path: (world: World) => `${org(world)}/settings/${section}`,
    heading,
  })),
  { name: "module settings", path: (world) => `${org(world)}/settings/m/example`, heading: "Exemplo" },
  ...PROFILE.map(([section, heading]) => ({ name: `profile ${section}`, path: () => `profile/${section}`, heading })),
];

// A cold page restores the session (cookie exchange + Firebase custom token) before its queries
// run; with every browser project in parallel on one machine that can take longer than the
// default expect timeout.
const SETTLE_TIMEOUT_MS = 30_000;

/**
 * Waits for the page's h1, its title (Next streams metadata after the first paint) and for every
 * "Carregando…"/"Loading…" status to go away.
 */
const settle = async (page: Page, heading: string | RegExp): Promise<void> => {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
  await expect(page).toHaveTitle(/\S/, { timeout: SETTLE_TIMEOUT_MS });
  await expect(page.getByText(/^(Carregando|Loading)/)).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS });
};

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe in the ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test.describe("signed out", () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test("sign-in page", async ({ page }) => {
        await page.goto("sign-in");
        await settle(page, "Entrar");
        await expectNoAxeViolations(page);
      });
    });

    for (const pageCase of USER_PAGES) {
      test(pageCase.name, async ({ page, world }) => {
        await page.goto(pageCase.path(world));
        await settle(page, pageCase.heading);
        await expectNoAxeViolations(page);
      });
    }

    test("command palette open", async ({ page, world }) => {
      await page.goto(project(world));
      await settle(page, "Alpha Launch");
      await page.getByRole("button", { name: /Abrir paleta de comandos/ }).click();
      await expect(page.getByRole("dialog", { name: "Paleta de comandos" })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test.describe("entry pages signed out", () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test("invite link without its token", async ({ page }) => {
        await page.goto("invite");
        await expect(page.getByRole("heading", { name: "Link de convite incompleto" })).toBeVisible({
          timeout: SETTLE_TIMEOUT_MS,
        });
        await expectNoAxeViolations(page);
      });

      test("invite asking to sign in", async ({ page }) => {
        await page.goto(`invite#token=${"a".repeat(43)}`);
        await expect(page.getByRole("heading", { name: "Entre para ver o convite" })).toBeVisible({
          timeout: SETTLE_TIMEOUT_MS,
        });
        await expectNoAxeViolations(page);
      });
    });

    test("invite that cannot be used", async ({ page }) => {
      await page.goto(`invite#token=${"b".repeat(43)}`);
      await expect(page.getByRole("heading", { name: "Não foi possível usar este convite" })).toBeVisible({
        timeout: SETTLE_TIMEOUT_MS,
      });
      await expectNoAxeViolations(page);
    });

    test("not found", async ({ page }) => {
      await page.goto("this-page-does-not-exist");
      await settle(page, "Página não encontrada");
      await expectNoAxeViolations(page);
    });

    test("confirmation dialog open", async ({ page, world }) => {
      await page.goto(`${org(world)}/settings/members`);
      await settle(page, "Membros");
      await page
        .getByRole("button", { name: /^Remover (?!Demo Owner)/ })
        .first()
        .click();
      await expect(page.getByRole("alertdialog", { name: /^Remover .+ da organização\?$/ })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("second-factor enrollment dialog open", async ({ page }) => {
      await page.goto("profile/security");
      await settle(page, "Segurança");
      // The emulator offers SMS only (it does not implement TOTP); both factors use the same dialog frame.
      await page.getByRole("button", { name: "Adicionar telefone" }).click();
      await expect(page.getByRole("dialog", { name: "Adicionar telefone" })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
    });

    test.describe("platform staff", () => {
      test.use({ storageState: authFile("staff") });

      test("admin home", async ({ page }) => {
        await page.goto("admin");
        await settle(page, "Administração da plataforma");
        await expectNoAxeViolations(page);
      });
    });
  });
}

test.describe("axe in en-US", () => {
  const EN_PAGES: PageCase[] = [
    { name: "organization home", path: org, heading: "Alpha Org" },
    { name: "settings members", path: (world) => `${org(world)}/settings/members`, heading: "Members" },
    { name: "profile preferences", path: () => "profile/preferences", heading: "Preferences" },
  ];

  test("sign-in page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/en-US/sign-in");
    await settle(page, "Sign in");
    await expectNoAxeViolations(page);
    await context.close();
  });

  for (const pageCase of EN_PAGES) {
    test(pageCase.name, async ({ page, world }) => {
      await page.goto(`/en-US/${pageCase.path(world)}`);
      await settle(page, pageCase.heading);
      await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("axe in es-419", () => {
  const ES_PAGES: PageCase[] = [
    { name: "organizations", path: () => "organizations", heading: "Organizaciones" },
    { name: "settings members", path: (world) => `${org(world)}/settings/members`, heading: "Miembros" },
    { name: "profile security", path: () => "profile/security", heading: "Seguridad" },
  ];

  test("sign-in page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "es-419" });
    const page = await context.newPage();
    await page.goto("/es-419/sign-in");
    await settle(page, "Iniciar sesión");
    await expectNoAxeViolations(page);
    await context.close();
  });

  for (const pageCase of ES_PAGES) {
    test(pageCase.name, async ({ page, world }) => {
      await page.goto(`/es-419/${pageCase.path(world)}`);
      await settle(page, pageCase.heading);
      await expect(page.locator("html")).toHaveAttribute("lang", "es-419");
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("axe on the second-factor step and the support access banner", () => {
  test("staff signs in with SMS, then views the app as a user", async ({ browser, emulator, world }) => {
    test.setTimeout(180_000);
    const staff = await openAs(browser, { cookies: [], origins: [] });
    const page = staff.page;
    // The Auth Emulator answers the SDK's reCAPTCHA Enterprise config with 501 (see admin-users.spec).
    staff.guard.allow(/status of 501 \(Not Implemented\)/);
    // A Firefox performance advisory (a scroll listener moves an element), logged as a warning;
    // it is not an error of the page and the other browsers do not emit it.
    staff.guard.allow(/scroll-linked positioning effect/);
    await submitSignIn(page, SEED_USERS.staff, "sign-in?next=%2Fadmin%2Fusers");
    await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible({
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expectNoAxeViolations(page);
    await completeSmsChallenge(page, emulator);
    await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });

    const search = page.getByRole("region", { name: "Buscar usuário" });
    await search.getByRole("searchbox", { name: "Nome, e-mail ou id" }).fill(SEED_USERS.viewer.email);
    await search.getByRole("button", { name: "Buscar" }).click();
    await search
      .getByRole("button", { name: `Selecionar ${SEED_USERS.viewer.displayName} para o acesso de suporte` })
      .click();
    const start = page.getByRole("region", { name: "Iniciar acesso como usuário" });
    await start.getByRole("combobox", { name: "Organização", exact: true }).click();
    await page.getByRole("option", { name: world.alpha.name }).click();
    await start.getByRole("textbox", { name: "Motivo" }).fill("E2E support ticket: accessibility check.");
    await start.getByRole("spinbutton", { name: "Duração em minutos" }).fill("5");
    await start.getByRole("button", { name: "Iniciar sessão" }).click();
    await page
      .getByRole("region", { name: "Sessão aberta nesta aba" })
      .getByRole("button", { name: "Abrir o app como este usuário" })
      .click();
    await expect(page.getByText(/Você está vendo o app como .+, em modo somente leitura/)).toBeVisible({
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByText(/^(Carregando|Loading)/)).toHaveCount(0, { timeout: SETTLE_TIMEOUT_MS });
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Sair do modo suporte" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/admin\/users$/, { timeout: SETTLE_TIMEOUT_MS });
    await staff.close();
  });
});
