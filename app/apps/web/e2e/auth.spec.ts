import { accountMenu, signInThroughUi, submitSignIn } from "@core/e2e/sign-in";
import { expect, test } from "./web-test.ts";

// SP2 spec §13 item 1: sign in lands in the last context; sign out closes the protected pages.
test.describe("authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signs in and lands in the last organization used", async ({ page, world, createUser }) => {
    const user = await createUser({ label: "Auth", organizations: [{ id: world.beta.id }, { id: world.alpha.id }] });
    await signInThroughUi(page, user);
    await expect(page).toHaveURL(new RegExp(`/pt-BR/o/${world.alpha.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.name })).toBeVisible();
  });

  test("returns to the requested page after signing in", async ({ page, world, createUser }) => {
    const user = await createUser({ label: "Next", organizations: [{ id: world.alpha.id }] });
    await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
    await expect(page).toHaveURL(/\/pt-BR\/sign-in\?next=/);
    await page.getByRole("textbox", { name: "E-mail" }).fill(user.email);
    await page.getByRole("textbox", { name: "Senha" }).fill(user.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.projects.launch.name })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/p/${world.alpha.projects.launch.id}$`));
  });

  test("signs out and protected pages redirect to sign-in", async ({ page, world, createUser }) => {
    const user = await createUser({ label: "Exit", organizations: [{ id: world.alpha.id }] });
    await signInThroughUi(page, user);
    await (await accountMenu(page, user.displayName)).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
    await page.goto(`o/${world.alpha.id}`);
    await expect(page).toHaveURL(/\/pt-BR\/sign-in\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  });

  test("shows the credentials error and the field errors", async ({ page, createUser }) => {
    const user = await createUser({ label: "Wrong" });
    await page.goto("sign-in");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Informe seu e-mail.")).toBeVisible();
    await expect(page.getByText("Informe sua senha.")).toBeVisible();
    await submitSignIn(page, { email: user.email, password: "not-the-password" });
    await expect(page.getByText("E-mail ou senha incorretos. Confira os dados e tente novamente.")).toBeVisible();
  });
});

test.describe("session restore", () => {
  test("a stored web session reopens the user area after a reload", async ({ page, world }) => {
    await page.goto(`o/${world.alpha.id}`);
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.name })).toBeVisible();
    await page.reload();
    await expect(await accountMenu(page, "Demo Owner")).toBeVisible();
  });
});
