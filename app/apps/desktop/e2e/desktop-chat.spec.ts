import { expectNoAxeViolations } from "@core/e2e/axe";
import { watchConsole } from "@core/e2e/console-guard";
import { signInThroughUi } from "@core/e2e/sign-in";
import { expect, test } from "./desktop-test.ts";

// SP4 (umbrella §8, D2): the same chat widget on the desktop frontend (TanStack Router, no locale
// segment) streams an answer through the e2e /v1 and the agent runtime, with a clean console.

test("opens the chat of a project, streams an answer and keeps the conversation in the address", async ({ page, world, createUser }) => {
  const guard = watchConsole(page);
  const user = await createUser({ label: "DeskChat", organizations: [{ id: world.alpha.id }] });
  await signInThroughUi(page, user, "/sign-in");
  await page.getByRole("main").getByRole("link", { name: world.alpha.projects.launch.name }).click();
  await page.getByRole("navigation", { name: "Navegação" }).getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${world.alpha.projects.launch.id}/chat$`));
  const panel = page.locator('[data-slot="chat-view"] [data-slot="chat-panel"]');
  await expect(panel.getByRole("heading", { name: "Como posso ajudar?" })).toBeVisible();

  const composer = panel.getByRole("textbox", { name: "Mensagem" });
  await composer.fill("Hello from the desktop");
  await composer.press("Enter");
  await expect(panel.locator('[data-slot="chat-status"]')).toHaveAttribute("data-phase", "finished", { timeout: 30_000 });
  await expect(panel.getByRole("article", { name: "Assistente" })).toContainText("Hello from the desktop");
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  await expect(page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Hello from the desktop" })).toBeVisible();
  await expectNoAxeViolations(page);
  expect(guard.problems(), "browser console errors and warnings").toEqual([]);
});
