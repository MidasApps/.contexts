import { SEED_USERS } from "@core/e2e/seed-users";
import { closeSidebarSheet, showSidebar, signInThroughUi } from "@core/e2e/sign-in";
import type { Page, Route } from "@playwright/test";
import { authFile, expect, test } from "./web-test.ts";

// SP2 spec §13 item 2: switching from the sidebar and the palette, units, breadcrumbs, the module
// page and permission-filtered navigation; plus the shell's loading, error and empty states.

const breadcrumbs = (page: Page) => page.getByRole("navigation", { name: "Trilha de navegação" });
/** The phone sidebar sheet (a modal dialog); never present on wider screens. */
const navigationSheet = (page: Page) => page.getByRole("dialog", { name: "Navegação" });

/** Holds matching requests until `release()`; lets a test see the loading UI without sleeping. */
const holdRequests = async (page: Page, pattern: string | RegExp) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(pattern, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return { release: () => release() };
};

test.describe("switching context", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("switches organization and project from the sidebar; breadcrumbs follow", async ({
    page,
    world,
    createUser,
  }) => {
    const user = await createUser({ label: "Switch", organizations: [{ id: world.beta.id }, { id: world.alpha.id }] });
    await signInThroughUi(page, user);
    await showSidebar(page);
    await page.getByRole("button", { name: `${world.alpha.name}, trocar de organização` }).click();
    await page.getByRole("menuitemradio", { name: world.beta.name }).click();
    await expect(page).toHaveURL(new RegExp(`/o/${world.beta.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: world.beta.name })).toBeVisible();
    // On phones the sheet closes by itself once the switch lands on the new path.
    await expect(navigationSheet(page)).toBeHidden();
    await showSidebar(page);
    await expect(page.getByRole("button", { name: `${world.beta.name}, trocar de organização` })).toBeVisible();
    await closeSidebarSheet(page);
    await expect(breadcrumbs(page).getByRole("link", { name: world.beta.name })).toBeVisible();

    await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
    await showSidebar(page);
    await page.getByRole("button", { name: `${world.alpha.projects.launch.name}, trocar de projeto` }).click();
    await page.getByRole("menuitemradio", { name: world.alpha.projects.growth.name }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${world.alpha.projects.growth.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.projects.growth.name })).toBeVisible();
    await expect(navigationSheet(page)).toBeHidden();
    await showSidebar(page);
    await expect(
      page.getByRole("button", { name: `${world.alpha.projects.growth.name}, trocar de projeto` }),
    ).toBeVisible();
    await closeSidebarSheet(page);
    await expect(breadcrumbs(page).getByRole("link", { name: world.alpha.projects.growth.name })).toBeVisible();
  });

  test("a project-only member lands on their project instead of the organization's not-found", async ({
    page,
    world,
  }) => {
    const { growth } = world.alpha.projects;
    await signInThroughUi(page, SEED_USERS.member);
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toHaveCount(0);
    // The organization page asks for the organization-level context, which answers 404 for a
    // member whose only grant is on a project (decision 0030 A5): the shell takes them there.
    await page.goto(`o/${world.alpha.id}`);
    await expect(page).toHaveURL(new RegExp(`/o/${world.alpha.id}/p/${growth.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: growth.name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toHaveCount(0);
  });

  test("switches organization and opens a project from the command palette", async ({ page, world, createUser }) => {
    const user = await createUser({ label: "Palette", organizations: [{ id: world.beta.id }, { id: world.alpha.id }] });
    await signInThroughUi(page, user);
    await page.getByRole("button", { name: /Abrir paleta de comandos/ }).click();
    const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
    await palette.getByRole("combobox", { name: "Buscar comando ou página" }).fill(world.beta.name);
    await palette.getByRole("option", { name: `Trocar para ${world.beta.name}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: world.beta.name })).toBeVisible();

    // Reopen only once the first palette has fully closed: pressing the shortcut during its exit
    // animation stacked a second overlay over the new one (WebKit/Firefox).
    await expect(palette).toBeHidden();
    await expect(page.locator("[data-slot=dialog-overlay]")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox", { name: "Buscar comando ou página" }).fill(world.beta.projects.pilot.name);
    await palette.getByRole("option", { name: `Abrir projeto ${world.beta.projects.pilot.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${world.beta.projects.pilot.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: world.beta.projects.pilot.name })).toBeVisible();
  });
});

test.describe("project shell", () => {
  test("the unit picker puts the unit in ?unit= and in the breadcrumbs", async ({ page, world }) => {
    const { launch } = world.alpha.projects;
    await page.goto(`o/${world.alpha.id}/p/${launch.id}`);
    await showSidebar(page);
    await page.getByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }).click();
    await page
      .getByRole("dialog", { name: "Escolha uma unidade" })
      .getByRole("treeitem", { name: world.alpha.units.north.name })
      .click();
    await expect(page).toHaveURL(new RegExp(`/p/${launch.id}\\?unit=${world.alpha.units.north.id}$`));
    await closeSidebarSheet(page);
    await expect(breadcrumbs(page).getByText(world.alpha.units.north.name)).toBeVisible();
    await expect(page.getByRole("main").getByText("Unidade atual:")).toBeVisible();
  });

  test("renders the example module page from the project navigation", async ({ page, world }) => {
    const { launch } = world.alpha.projects;
    await page.goto(`o/${world.alpha.id}/p/${launch.id}`);
    await showSidebar(page);
    await page.getByRole("navigation", { name: "Navegação" }).getByRole("link", { name: "Exemplo" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${launch.id}/m/example$`));
    await expect(navigationSheet(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Módulo de exemplo" })).toBeVisible();
    await expect(page.getByRole("main").getByText(world.alpha.name).first()).toBeVisible();
  });

  test.describe("a viewer", () => {
    test.use({ storageState: authFile("viewer") });

    test("sees the module item the viewer role can read", async ({ page, world }) => {
      await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
      await showSidebar(page);
      await expect(
        page.getByRole("navigation", { name: "Navegação" }).getByRole("link", { name: "Exemplo" }),
      ).toBeVisible();
    });
  });

  test.describe("a member without module permissions", () => {
    test.use({ storageState: authFile("restricted") });

    test("does not see the module item", async ({ page, world }) => {
      await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
      await showSidebar(page);
      const nav = page.getByRole("navigation", { name: "Navegação" });
      await expect(nav.getByRole("link", { name: "Visão geral" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Exemplo" })).toHaveCount(0);
      await expect(page.getByText("Nenhum módulo disponível")).toBeVisible();
    });
  });
});

test.describe("shell states", () => {
  test("shows the loading state while the projects load", async ({ page, world }) => {
    const held = await holdRequests(page, /\/v1\/organizations\/[^/]+\/projects/);
    await page.goto(`o/${world.alpha.id}`);
    await expect(page.getByRole("status").filter({ hasText: "Carregando projetos…" }).first()).toBeVisible();
    held.release();
    await expect(page.getByRole("link", { name: world.alpha.projects.launch.name })).toBeVisible();
  });

  test("offers a retry when the projects fail to load", async ({ page, world }) => {
    // Every attempt fails (the client retries on its own) until the error state is on screen. The
    // client waits 1 s, 2 s and 4 s between its attempts; the page's clock jumps over those waits,
    // so the error state does not have to fit in what the expect timeout leaves after them.
    await page.clock.install();
    let failing = true;
    await page.route(/\/v1\/organizations\/[^/]+\/projects/, async (route) => {
      if (!failing || route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 500,
        json: {
          error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: "01JE2E0000000000000000TEST" },
        },
      });
    });
    await page.goto(`o/${world.alpha.id}`);
    const errorState = page.getByRole("alert").filter({ hasText: "Algo deu errado do nosso lado" });
    await expect(async () => {
      await page.clock.fastForward(4_000);
      await expect(errorState).toBeVisible({ timeout: 500 });
    }).toPass();
    failing = false;
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByRole("link", { name: world.alpha.projects.launch.name })).toBeVisible();
  });

  test.describe("a user without organizations", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("sees the empty organizations page with the create form", async ({ page, createUser }) => {
      const user = await createUser({ label: "Empty" });
      await signInThroughUi(page, user);
      await expect(page).toHaveURL(/\/pt-BR\/organizations$/);
      await expect(page.getByText("Você ainda não participa de nenhuma organização")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Nome da organização" })).toBeVisible();
    });
  });
});
