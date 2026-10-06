import { expectNoAxeViolations } from "@core/e2e/axe";
import { showSidebar } from "@core/e2e/sign-in";
import {
  chatPanel,
  chatPath,
  chatStatus,
  composer,
  conversationIdOf,
  expect,
  expectAnswered,
  FAILED_REQUEST,
  FAKE,
  history,
  messageLog,
  openChat,
  openChatFromNavigation,
  SIGNED_OUT,
  send,
  test,
} from "./chat-test.ts";
import { authFile } from "./web-test.ts";

// SP4 gate, part 1 (umbrella §8): the chat opens from the project navigation, a turn streams
// through `/v1/chat` and the agent runtime (fake models), and every state is said in words.

const LONG_QUESTION = "Tell me a long story about rivers and mountains and seas and deserts";

test.describe("a member's own chat", () => {
  test.use({ storageState: SIGNED_OUT });

  test("opens from the project navigation, streams an answer and keeps the conversation in the address", async ({
    page,
    world,
    signInFresh,
  }) => {
    await signInFresh();
    await openChatFromNavigation(page, world);
    await expect(chatPanel(page).getByRole("heading", { name: "Como posso ajudar?" })).toBeVisible();
    await expectNoAxeViolations(page);

    await send(page, `Hello there ${FAKE.slow(300)}`);
    await expect(chatStatus(page)).toHaveAttribute("data-phase", /connecting|responding/);
    await expect(chatStatus(page).getByRole("status")).toHaveText(/Conectando…|Respondendo…/);
    await expect(messageLog(page).getByRole("article", { name: "Você" })).toContainText("Hello there");
    // The address names the conversation while the answer is still streaming, and the thread on
    // screen is the same one: it reaches "finished", which a thread built again would never show.
    expect(await conversationIdOf(page)).not.toBe("");
    await expectAnswered(page);
    await expect(messageLog(page).getByRole("article", { name: "Assistente" })).toContainText(
      /Fake answer [0-9a-f]{8}: Hello there/,
    );
    await expect(messageLog(page).getByRole("article")).toHaveCount(2);
    await expectNoAxeViolations(page);
  });

  test("stops an answer in the middle and keeps the partial text", async ({ page, world, signInFresh }) => {
    await signInFresh();
    await openChat(page, world);
    await send(page, `${LONG_QUESTION} ${FAKE.slow(1000)}`);
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "responding", { timeout: 30_000 });
    await expect(messageLog(page).getByRole("article", { name: "Assistente" })).toContainText("Fake answer");

    await chatPanel(page).getByRole("button", { name: "Parar resposta" }).click();
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "stopped");
    await expect(chatStatus(page).getByRole("status")).toHaveText("Resposta interrompida.");
    const answer = messageLog(page).getByRole("article", { name: "Assistente" });
    await expect(answer.locator('[data-slot="interrupted"]')).toHaveText("Interrompido");
    await expect(composer(page)).toBeFocused();
    // The stop also ended the run on the server: the history no longer says it is answering.
    await expect(history(page).getByRole("listitem")).toHaveCount(1);
    await expect(history(page).getByText("Respondendo")).toHaveCount(0);
    await expect(chatPanel(page).getByRole("button", { name: "Parar resposta" })).toHaveCount(0);
  });

  test("resumes a streaming answer after a reload, with the question still on screen", async ({
    page,
    world,
    signInFresh,
  }) => {
    await signInFresh();
    await openChat(page, world);
    await send(page, `${LONG_QUESTION} ${FAKE.slow(1500)}`);
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "responding", { timeout: 30_000 });
    await conversationIdOf(page);

    await page.reload();
    await expect(chatStatus(page)).toHaveAttribute("data-phase", /resuming|responding/, { timeout: 30_000 });
    await expect(messageLog(page).getByRole("article", { name: "Você" })).toContainText(LONG_QUESTION);
    await expectAnswered(page);
    await expect(messageLog(page).getByRole("article", { name: "Assistente" })).toContainText(`Fake answer`);
    await expect(messageLog(page).getByRole("article", { name: "Assistente" })).toContainText("deserts");
    await expect(messageLog(page).getByRole("article")).toHaveCount(2);
  });

  test("marks an answer without a source as uncertain while it is still streaming", async ({
    page,
    world,
    signInFresh,
  }) => {
    await signInFresh();
    await openChat(page, world);
    // A question goes to the knowledge agent; this organization has no document, so no source.
    await send(page, `How long are files kept? ${FAKE.slow(800)}`);
    const answer = messageLog(page).getByRole("article", { name: "Assistente" });
    await expect(answer.locator('[data-slot="low-confidence"]')).toHaveText("Sem certeza", { timeout: 30_000 });
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "responding");
    await expect(answer.getByRole("button", { name: /Delegado para Agente de conhecimento/ })).toBeVisible();
    await expectAnswered(page);
    await expect(answer.locator('[data-slot="low-confidence"]')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("says that the answer failed, with a way to try again", async ({ page, world, signInFresh }) => {
    await signInFresh();
    await openChat(page, world);
    await send(page, `Hello ${FAKE.error}`);
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "error", { timeout: 30_000 });
    const alert = chatStatus(page).getByRole("alert");
    await expect(alert).toContainText("Não foi possível responder");
    await expect(alert.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("keeps the draft and blocks sending while offline, and sends once the connection is back", async ({
    page,
    world,
    context,
    signInFresh,
    consoleGuard,
  }) => {
    // The shell keeps polling while offline; Chromium logs each failed request.
    consoleGuard.allow(FAILED_REQUEST);
    await signInFresh();
    await openChat(page, world);
    await composer(page).fill("Written while offline");
    await context.setOffline(true);
    await expect(chatStatus(page)).toHaveAttribute("data-phase", "offline");
    // Offline is said once, by the composer (and the shell banner); the status line stays quiet.
    await expect(chatStatus(page).getByRole("status")).toHaveText("");
    await expect(chatPanel(page).getByText("Sem conexão. Envio indisponível até a conexão voltar.")).toBeVisible();
    await composer(page).press("Enter");
    await expect(composer(page)).toHaveValue("Written while offline");
    await expect(messageLog(page).getByRole("article")).toHaveCount(0);

    await context.setOffline(false);
    await expect(chatStatus(page)).not.toHaveAttribute("data-phase", "offline");
    await composer(page).press("Enter");
    await expectAnswered(page);
    await expect(messageLog(page).getByRole("article", { name: "Assistente" })).toContainText("Written while offline");
  });
});

test.describe("without permission", () => {
  // "Core only" role: organization and projects, no `core.conversation.send`.
  test.use({ storageState: authFile("restricted") });

  test("hides the chat from the navigation and refuses its address", async ({ page, world }) => {
    await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
    await expect(page.getByRole("heading", { level: 1, name: world.alpha.projects.launch.name })).toBeVisible();
    await showSidebar(page);
    await expect(
      page.getByRole("navigation", { name: "Navegação" }).getByRole("link", { name: "Visão geral" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Assistente", exact: true })).toHaveCount(0);

    await page.goto(chatPath(world));
    await expect(page.getByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeVisible();
    await expect(page.locator('[data-slot="chat-panel"]')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe("voice behind its flag", () => {
  test("shows no voice control while the organization's voice flag is off", async ({ page, world, ownerApi }) => {
    // Beta Org is used by this journey only; voice is on by default in local (decision 0034).
    await ownerApi.put(`/v1/flags/chat.voice?organizationId=${world.beta.id}`, { value: false });
    await page.goto(`o/${world.beta.id}/p/${world.beta.projects.pilot.id}/chat`);
    await expect(chatPanel(page).getByRole("heading", { name: "Como posso ajudar?" })).toBeVisible();
    await expect(chatPanel(page).getByRole("button", { name: "Anexar" })).toBeVisible();
    await expect(chatPanel(page).getByRole("button", { name: /Falar/ })).toHaveCount(0);
    await expect(chatPanel(page).getByRole("button", { name: "Opções de voz" })).toHaveCount(0);

    await send(page, "Hello without voice");
    await expectAnswered(page);
    const answer = messageLog(page).getByRole("article", { name: "Assistente" });
    await expect(answer.getByRole("button", { name: "Copiar resposta" })).toBeVisible();
    await expect(answer.getByRole("button", { name: "Ouvir resposta" })).toHaveCount(0);
  });
});
