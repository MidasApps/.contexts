import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { fillSignInForm, signInThroughUi } from "@core/e2e/sign-in";
import { authFile, expect, test } from "./web-test.ts";

// SP2 spec §13 item 4 as the seeded owner in "Alpha Org" (mutations use unique names), empty
// states in the untouched "Beta Org", and the read-only settings of the seeded viewer.

const unique = (label: string): string => `${label} ${randomUUID().slice(0, 8)}`;

const settings = (organizationId: string, section: string): string => `o/${organizationId}/settings/${section}`;

/** A table row on wide screens, a card (list item) on phones: DataTable switches by viewport. */
const entry = (page: Page, text: string | RegExp) => page.getByRole("row").or(page.getByRole("listitem")).filter({ hasText: text });

const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notificações/ }).getByText(text);

test.describe("members and invitations", () => {
  test("invites a member, copies the link, the invitee accepts, then their roles change", async ({ page, browser, world, emulator, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright; the flow is the same elsewhere");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const email = `invitee-${randomUUID().slice(0, 8)}@e2e.local`;
    const invitee = { email, password: `pw-${randomUUID().slice(0, 8)}`, displayName: unique("Invitee") };
    await emulator.upsertUser(invitee);

    await page.goto(settings(world.alpha.id, "invitations"));
    await page.getByRole("button", { name: "Convidar" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Convidar pessoa" });
    await dialog.getByRole("textbox", { name: /E-mail/ }).fill(email);
    await dialog.getByRole("checkbox", { name: /Membro/ }).check();
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    // The dialog keeps its title and shows the one-time link in place.
    const created = page.getByRole("dialog", { name: "Convidar pessoa" });
    await expect(created.getByText(`Convite criado para ${email}`)).toBeVisible();
    const link = await created.getByRole("textbox", { name: "Link do convite" }).inputValue();
    // The link carries the inviter's locale, so the invitee opens it without a locale redirect.
    expect(link).toMatch(/\/pt-BR\/invite#token=[\w-]{43}$/);
    await created.getByRole("button", { name: "Copiar" }).click();
    // CopyField confirms in its own live region (screen-reader only), not with a toast.
    await expect(created.getByRole("status").filter({ hasText: "Copiado para a área de transferência." })).toHaveCount(1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await created.getByRole("button", { name: "Concluir" }).click();
    await expect(entry(page, email)).toBeVisible();

    const inviteeContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(link);
    await expect(inviteePage.getByRole("heading", { name: "Entre para ver o convite" })).toBeVisible();
    await fillSignInForm(inviteePage, invitee);
    await expect(inviteePage.getByText(`convidou você para participar de ${world.alpha.name}`)).toBeVisible();
    await inviteePage.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(inviteePage.getByText(`Agora você participa de ${world.alpha.name}.`)).toBeVisible();
    await inviteeContext.close();

    await page.goto(settings(world.alpha.id, "members"));
    await page.getByRole("button", { name: `Editar papéis de ${invitee.displayName}` }).click();
    const roles = page.getByRole("dialog", { name: `Papéis de ${invitee.displayName}` });
    await roles.getByRole("checkbox", { name: /Administrador/ }).check();
    await roles.getByRole("button", { name: "Salvar papéis" }).click();
    await expect(toast(page, `Papéis de ${invitee.displayName} atualizados.`)).toBeVisible();
    await expect(entry(page, email)).toContainText("Administrador");
  });
});

test.describe("credentials", () => {
  test("creates an API key whose secret is shown once", async ({ page, world }) => {
    const name = unique("Report export");
    await page.goto(settings(world.alpha.id, "api-keys"));
    await page.getByRole("button", { name: "Nova chave" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nova chave de API" });
    await dialog.getByRole("textbox", { name: /^Nome/ }).fill(name);
    await dialog.getByRole("checkbox", { name: /Ver projetos/ }).check();
    await dialog.getByRole("button", { name: "Criar chave" }).click();
    const created = page.getByRole("dialog", { name: `Chave ${name} criada` });
    await expect(created.getByText("Esta é a única vez que a chave aparece")).toBeVisible();
    const secret = created.getByRole("textbox", { name: "Chave de API" });
    await expect(secret).not.toHaveValue(/^core_/);
    await created.getByRole("button", { name: "Mostrar valor" }).click();
    await expect(secret).toHaveValue(/^core_[\w-]+$/);
    await created.getByRole("checkbox", { name: "Copiei e guardei a chave em lugar seguro" }).check();
    await created.getByRole("button", { name: "Concluir" }).click();
    await expect(entry(page, name)).toContainText("Ativa");
    await page.reload();
    await expect(entry(page, name)).toBeVisible();
    await expect(page.getByText(/^core_/)).toHaveCount(0);
  });

  test("on a 360×640 phone the tall key dialog fits and scrolls to its actions, and Esc asks before dropping the secret", async ({ page, world }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const name = unique("Phone key");
    await page.goto(settings(world.alpha.id, "api-keys"));
    await page.getByRole("button", { name: "Nova chave" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nova chave de API" });
    await expect(dialog.getByRole("heading", { name: "Nova chave de API" })).toBeInViewport();
    expect((await dialog.boundingBox())?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(640);
    await dialog.getByRole("textbox", { name: /^Nome/ }).fill(name);
    await dialog.getByRole("checkbox", { name: /Ver projetos/ }).check();
    const submit = dialog.getByRole("button", { name: "Criar chave" });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await submit.click();
    const created = page.getByRole("dialog", { name: `Chave ${name} criada` });
    await expect(created.getByRole("textbox", { name: "Chave de API" })).toBeVisible();
    await page.keyboard.press("Escape");
    const question = page.getByRole("alertdialog", { name: "Fechar sem guardar?" });
    await question.getByRole("button", { name: "Voltar" }).click();
    await expect(created.getByRole("textbox", { name: "Chave de API" })).toBeVisible();
    await created.getByRole("checkbox", { name: "Copiei e guardei a chave em lugar seguro" }).check();
    await created.getByRole("button", { name: "Concluir" }).click();
    await expect(created).toBeHidden();
  });

  test("creates a device activation code", async ({ page, world }) => {
    const label = unique("Reception tablet");
    await page.goto(settings(world.alpha.id, "devices"));
    await page.getByRole("button", { name: "Ativar dispositivo" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Ativar dispositivo" });
    await dialog.getByRole("textbox", { name: /Nome do dispositivo/ }).fill(label);
    await dialog.getByRole("checkbox", { name: /Dispositivo/ }).check();
    await dialog.getByRole("button", { name: "Gerar código" }).click();
    const code = page.getByRole("dialog", { name: `Código para ${label}` });
    await expect(code.getByText("Código de ativação")).toBeVisible();
    await expect(code.getByText(/Expira em \d{1,2}:\d{2}/)).toBeVisible();
  });
});

test.describe("module settings", () => {
  test("validates and saves the example module settings; the module page shows them", async ({ page, world }) => {
    const greeting = unique("Welcome");
    await page.goto(settings(world.alpha.id, "m/example"));
    await page.getByRole("textbox", { name: /^Saudação/ }).fill(greeting);
    await page.getByRole("textbox", { name: /^Orçamento padrão/ }).fill("");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Preencha este campo.")).toBeVisible();
    // MoneyInput parses on blur into minor units.
    await page.getByRole("textbox", { name: /^Orçamento padrão/ }).fill("1.234,56");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Salvar" }).click();
    // SchemaForm confirms in a status region next to the form.
    await expect(page.getByRole("status").filter({ hasText: "Alterações salvas." }).first()).toBeVisible();
    await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}/m/example`);
    await expect(page.getByText(greeting)).toBeVisible();
    await expect(page.getByText(/R\$\s1\.234,56/)).toBeVisible();
  });
});

test.describe("empty lists", () => {
  const EMPTY: [string, string][] = [
    ["invitations", "Nenhum convite pendente"],
    ["roles", "Nenhum papel personalizado"],
    ["api-keys", "Nenhuma chave de API"],
    ["devices", "Nenhum dispositivo ativado"],
  ];
  for (const [section, title] of EMPTY) {
    test(`${section} of an organization without any`, async ({ page, world }) => {
      await page.goto(settings(world.beta.id, section));
      await expect(page.getByText(title)).toBeVisible();
    });
  }
});

test.describe("a viewer", () => {
  test.use({ storageState: authFile("viewer") });

  test("sees only the sections the viewer role can read, read-only", async ({ page, world, isMobile }) => {
    await page.goto(settings(world.alpha.id, "general"));
    await expect(page.getByRole("heading", { level: 1, name: "Geral" })).toBeVisible();
    await expect(page.getByText("Somente administradores podem alterar estes dados.")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Seções das configurações" });
    // Grouped links on wide screens; on phones the same sections are a picker (decision 0055).
    if (isMobile) {
      await nav.getByRole("combobox", { name: "Seção" }).click();
      await expect(page.getByRole("option", { name: "Unidades" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(nav.getByRole("link", { name: "Unidades" })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Membros" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Chaves de API" })).toHaveCount(0);

    await page.goto(settings(world.alpha.id, "m/example"));
    await expect(page.getByText("Você pode ver estas configurações, mas não alterá-las.")).toBeVisible();
  });

  test("gets the no-access state on a section the role cannot read", async ({ page, world }) => {
    for (const section of ["members", "api-keys"]) {
      await page.goto(settings(world.alpha.id, section));
      await expect(page.getByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Nova chave" })).toHaveCount(0);
  });
});

test.describe("a new member", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signs in with the account the invitation was accepted with", async ({ page, world, createUser }) => {
    const user = await createUser({ label: "Joined", organizations: [{ id: world.alpha.id }] });
    await signInThroughUi(page, user);
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.name })).toBeVisible();
  });
});
