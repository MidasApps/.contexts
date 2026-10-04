import { randomUUID } from "node:crypto";
import type { V1Client } from "@core/e2e/api";
import { type ConsoleGuard, watchConsole } from "@core/e2e/console-guard";
import type { RoleRef, World } from "@core/e2e/seed-users";
import { showSidebar, signInThroughUi } from "@core/e2e/sign-in";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect, type FreshUser } from "./web-test.ts";

type ChatFixtures = {
  /** Fails the journey when the browser console shows an error or a warning it did not declare. */
  consoleGuard: ConsoleGuard;
  /**
   * A new member of Alpha Org, signed in through the UI: conversations belong to their owner, so
   * every journey has its own history, rate-limit bucket and approvals.
   */
  signInFresh: (args?: { label?: string; roles?: RoleRef[] }) => Promise<FreshUser>;
};

/** The chat journeys' `test`: the web fixtures plus a clean-console check on every test. */
export const test = base.extend<ChatFixtures>({
  consoleGuard: [
    async ({ page }, provide) => {
      const guard = watchConsole(page);
      await provide(guard);
      expect(guard.problems(), "browser console errors and warnings").toEqual([]);
    },
    { auto: true },
  ],
  signInFresh: async ({ page, world, createUser }, provide) => {
    await provide(async (args = {}) => {
      const user = await createUser({
        label: args.label ?? "Chat",
        organizations: [{ id: world.alpha.id, ...(args.roles === undefined ? {} : { roles: args.roles }) }],
      });
      await signInThroughUi(page, user);
      return user;
    });
  },
});

export type { FreshUser };
export { expect };

/** Journeys that sign their own user in start without the owner's session. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/** Directives of the scripted model (packages/agents/src/models/fake/fake-scenarios.ts). */
export const FAKE = {
  /** Streams the answer slowly enough to stop it or to reload under it. */
  slow: (delayMs: number): string => `[[fake:slow {"delayMs":${String(delayMs)}}]]`,
  /** The provider fails in the middle of the turn. */
  error: '[[fake:error {"message":"fake provider error"}]]',
} as const;

/** Console lines of a request the journey makes fail on purpose (Chromium logs every failed load). */
export const FAILED_REQUEST = /Failed to load resource/;

export const chatPath = (world: World, conversationId?: string): string =>
  `o/${world.alpha.id}/p/${world.alpha.projects.launch.id}/chat${conversationId === undefined ? "" : `/${conversationId}`}`;

/** The chat panel of the page (the view's, not the shell's right panel). */
export const chatPanel = (page: Page): Locator => page.locator('[data-slot="chat-view"] [data-slot="chat-panel"]');

/** The status line; its `data-phase` names the state the words describe. */
export const chatStatus = (page: Page): Locator => chatPanel(page).locator('[data-slot="chat-status"]');

export const messageLog = (page: Page): Locator =>
  chatPanel(page).getByRole("log", { name: "Conversa com o assistente" });

export const composer = (page: Page): Locator => chatPanel(page).getByRole("textbox", { name: "Mensagem" });

export const history = (page: Page): Locator => page.getByRole("navigation", { name: "Conversas" });

/** Opens the chat of "Alpha Launch" by its address and waits for the empty thread. */
export const openChat = async (page: Page, world: World): Promise<void> => {
  await page.goto(chatPath(world));
  await expect(chatPanel(page).getByRole("heading", { name: "Como posso ajudar?" })).toBeVisible();
};

/** Opens the project page and follows "Chat" in the project navigation. */
export const openChatFromNavigation = async (page: Page, world: World): Promise<void> => {
  await page.goto(`o/${world.alpha.id}/p/${world.alpha.projects.launch.id}`);
  await expect(page.getByRole("heading", { level: 1, name: world.alpha.projects.launch.name })).toBeVisible();
  await showSidebar(page);
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${world.alpha.projects.launch.id}/chat$`));
};

/** Types a message and sends it with Enter. */
export const send = async (page: Page, text: string): Promise<void> => {
  await composer(page).fill(text);
  await composer(page).press("Enter");
};

/** Waits until the answer of the current turn ended normally. */
export const expectAnswered = async (page: Page): Promise<void> => {
  await expect(chatStatus(page)).toHaveAttribute("data-phase", "finished", { timeout: 30_000 });
};

/** The id the server gave the conversation, read from the address once it has one. */
export const conversationIdOf = async (page: Page): Promise<string> => {
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
};

const CHAT_TURN_ATTEMPTS = 6;
const DEFAULT_RETRY_SECONDS = 5;
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends turns through `/v1/chat` as the user (data the journey starts from, not the journey): each
 * answer is read to its end before the next turn. A 429 of the `chat-turn` limit (20 per minute)
 * waits for its `Retry-After`. Returns the conversation id.
 */
export const seedTurns = async (api: V1Client, world: World, texts: readonly string[]): Promise<string> => {
  let conversationId: string | undefined;
  for (const text of texts) {
    const message = { id: randomUUID(), role: "user", parts: [{ type: "text", text }] };
    const body =
      conversationId === undefined
        ? { organizationId: world.alpha.id, projectId: world.alpha.projects.launch.id, message }
        : { conversationId, message };
    for (let attempt = 1; ; attempt += 1) {
      const response = await api.raw("POST", "/v1/chat", body);
      if (response.status === 429 && attempt < CHAT_TURN_ATTEMPTS) {
        await response.body?.cancel();
        await pause((Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS) * 1000);
        continue;
      }
      if (response.status !== 200) throw new Error(`POST /v1/chat → ${String(response.status)}`);
      conversationId ??= response.headers.get("x-conversation-id") ?? undefined;
      await response.text();
      break;
    }
  }
  if (conversationId === undefined) throw new Error("no turn was sent");
  return conversationId;
};
