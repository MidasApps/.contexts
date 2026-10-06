import { expectNoAxeViolations } from "@core/e2e/axe";
import {
  chatPanel,
  chatPath,
  chatStatus,
  conversationIdOf,
  expect,
  expectAnswered,
  FAILED_REQUEST,
  history,
  messageLog,
  openChat,
  SIGNED_OUT,
  seedTurns,
  send,
  test,
} from "./chat-test.ts";

// SP4 gate (umbrella §8): the history beside the chat — a new conversation appears with the title
// generated from its first message, the answering mark goes once the answer ends, and the member
// renames, pins, searches, archives, deletes and reopens conversations.

test.use({ storageState: SIGNED_OUT });

const row = (page: Parameters<typeof history>[0], title: string) =>
  history(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });

const openActions = async (page: Parameters<typeof history>[0], title: string) => {
  await history(page)
    .getByRole("button", { name: `Ações de ${title}` })
    .click();
};

test("lists a new conversation under its generated title, and stops saying it is answering once it ends", async ({
  page,
  world,
  signInFresh,
}) => {
  await signInFresh();
  await openChat(page, world);
  await expect(history(page).locator('[data-slot="history-count"]')).toHaveText("Nenhuma conversa");
  await send(page, "Plan the onboarding of a new member");
  await expectAnswered(page);
  const conversationId = await conversationIdOf(page);
  const item = history(page).locator(`[data-conversation-id="${conversationId}"]`);
  await expect(item.getByRole("link", { name: "Plan the onboarding of a new member" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(item.getByText("Respondendo")).toHaveCount(0);
  await expect(history(page).locator('[data-slot="history-count"]')).toHaveText("1 conversa");
  await expectNoAxeViolations(page);
});

test("renames, pins, searches, archives, restores and deletes conversations", async ({ page, world, signInFresh }) => {
  const user = await signInFresh();
  await seedTurns(user.api, world, ["Budget review for the quarter"]);
  await seedTurns(user.api, world, ["Hiring plan for the team"]);
  await openChat(page, world);
  await expect(history(page).locator('[data-slot="history-count"]')).toHaveText("2 conversas");

  await openActions(page, "Budget review for the quarter");
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  const field = history(page).getByRole("textbox", { name: "Novo título de Budget review for the quarter" });
  await field.fill("Quarterly budget");
  await field.press("Enter");
  await expect(row(page, "Quarterly budget")).toBeVisible();
  await expect(history(page).getByRole("link", { name: "Quarterly budget" })).toBeFocused();

  await openActions(page, "Quarterly budget");
  await page.getByRole("menuitem", { name: "Fixar" }).click();
  await expect(row(page, "Quarterly budget").getByText("Fixada")).toBeVisible();
  await expect(history(page).getByRole("listitem").first()).toContainText("Quarterly budget");

  await history(page).getByRole("searchbox", { name: "Buscar conversas" }).fill("hiring");
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  await expect(row(page, "Hiring plan for the team")).toBeVisible();
  await history(page).getByRole("searchbox", { name: "Buscar conversas" }).fill("");
  await expect(history(page).getByRole("listitem")).toHaveCount(2);

  await openActions(page, "Hiring plan for the team");
  await page.getByRole("menuitem", { name: "Resumir" }).click();
  const summary = page.getByRole("dialog", { name: "Resumo de Hiring plan for the team" });
  await expect(summary.getByText(/^Fake answer [0-9a-f]{8}:/)).toBeVisible({ timeout: 30_000 });
  await summary.getByRole("button", { name: "Fechar" }).first().click();
  await expect(summary).toBeHidden();

  await openActions(page, "Hiring plan for the team");
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  await history(page).getByRole("button", { name: "Arquivadas" }).click();
  await expect(row(page, "Hiring plan for the team")).toBeVisible();
  await openActions(page, "Hiring plan for the team");
  await page.getByRole("menuitem", { name: "Restaurar" }).click();
  await expect(history(page).getByRole("listitem")).toHaveCount(0);
  await history(page).getByRole("button", { name: "Arquivadas" }).click();
  await expect(history(page).getByRole("listitem")).toHaveCount(2);

  await openActions(page, "Quarterly budget");
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Excluir “Quarterly budget”?" });
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Excluir conversa" }).click();
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  await expect(history(page).locator('[data-slot="history-count"]')).toHaveText("1 conversa");
});

test("reopens a long conversation, loads earlier messages and keeps the reading position", async ({
  page,
  world,
  signInFresh,
}) => {
  test.setTimeout(240_000);
  const user = await signInFresh();
  // 26 turns = 52 messages: one more page than the 50 the thread loads first.
  const turns = Array.from({ length: 26 }, (_, index) => `Question number ${String(index + 1)}`);
  const conversationId = await seedTurns(user.api, world, turns);
  await openChat(page, world);
  await history(page).getByRole("link", { name: "Question number 1" }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${conversationId}$`));
  await expect(messageLog(page).getByText("Question number 26", { exact: true })).toBeVisible();
  await expect(messageLog(page).getByText("Question number 1", { exact: true })).toHaveCount(0);

  const anchor = messageLog(page).getByRole("article").first();
  const anchorId = await anchor.getAttribute("data-message-id");
  await messageLog(page).getByRole("button", { name: "Carregar mensagens anteriores" }).click();
  await expect(messageLog(page).getByText("Question number 1", { exact: true })).toBeAttached();
  await expect(messageLog(page).getByRole("button", { name: "Carregar mensagens anteriores" })).toHaveCount(0);
  await expect(messageLog(page).getByRole("article")).toHaveCount(52);
  // The message that was at the top stays in view: the log grew above it, not under the reader.
  await expect(messageLog(page).locator(`[data-message-id="${anchorId ?? ""}"]`)).toBeInViewport();
  await expect(messageLog(page).getByText("Question number 1", { exact: true })).not.toBeInViewport();

  await send(page, "One more question");
  await expectAnswered(page);
  await expect(messageLog(page).getByRole("article")).toHaveCount(54);
});

test("says when the history cannot be read, with a reference and a way to try again", async ({
  page,
  world,
  signInFresh,
  consoleGuard,
}) => {
  consoleGuard.allow(FAILED_REQUEST);
  await signInFresh();
  let failing = true;
  await page.route(/\/v1\/conversations\?/, async (route) => {
    if (!failing) return route.continue();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable.", requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" },
      }),
    });
  });
  await page.goto(chatPath(world));
  await expect(history(page).getByText("01J8Z3K4M5N6P7Q8R9S0T1V2W3")).toBeVisible();
  failing = false;
  await history(page).getByRole("button", { name: "Tentar novamente" }).click();
  await expect(history(page).locator('[data-slot="history-count"]')).toHaveText("Nenhuma conversa");
  await expect(chatPanel(page).getByRole("heading", { name: "Como posso ajudar?" })).toBeVisible();
  await expect(chatStatus(page)).toHaveAttribute("data-phase", "idle");
});
