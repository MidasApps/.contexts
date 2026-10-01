import type { Page } from "@playwright/test";
import { expectNoAxeViolations } from "@core/e2e/axe";
import type { World } from "@core/e2e/seed-users";
import { authFile, expect, test } from "./web-test.ts";

// SP2 spec §13 item 6: axe (WCAG 2.2 AA tags) clean on every shell page, in both themes, in pt-BR
// and en-US. Each page is checked once it settled: its heading is up and nothing is loading.

type PageCase = { name: string; path: (world: World) => string; heading: string | RegExp };

const org = (world: World): string => `o/${world.alpha.id}`;
const project = (world: World): string => `${org(world)}/p/${world.alpha.projects.launch.id}`;

const SETTINGS: [string, string][] = [
  ["general", "Geral"], ["members", "Membros"], ["invitations", "Convites"], ["roles", "Papéis"], ["units", "Unidades"],
  ["api-keys", "Chaves de API"], ["devices", "Dispositivos"], ["connectors", "Conectores"], ["agents", "Agentes"], ["usage", "Uso"],
];
const PROFILE: [string, string][] = [
  ["account", "Conta"], ["preferences", "Preferências"], ["security", "Segurança"], ["sessions", "Sessões"], ["notifications", "Notificações"],
];

const USER_PAGES: PageCase[] = [
  { name: "organization home", path: org, heading: "Alpha Org" },
  { name: "project home", path: project, heading: "Alpha Launch" },
  { name: "project home with a unit", path: (world) => `${project(world)}?unit=${world.alpha.units.north.id}`, heading: "Alpha Launch" },
  { name: "module page", path: (world) => `${project(world)}/m/example`, heading: "Módulo de exemplo" },
  { name: "organizations", path: () => "organizations", heading: "Organizações" },
  ...SETTINGS.map(([section, heading]) => ({ name: `settings ${section}`, path: (world: World) => `${org(world)}/settings/${section}`, heading })),
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
