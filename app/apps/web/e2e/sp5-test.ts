import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { V1Client } from "@core/e2e/api";
import { watchConsole, type ConsoleGuard } from "@core/e2e/console-guard";
import { joinOrganization, type RoleRef } from "@core/e2e/seed-users";
import { authFile, expect, test as base, type FreshUser } from "./web-test.ts";

// The `/admin` and `/settings` journeys of SP5 (Task 16). Each test gets its own organization (one
// per worker made empty states depend on file order), so the seeded "Alpha Org" and "Beta Org" stay as the SP2 specs expect them, and every journey
// fails when the browser console shows an error or a warning it did not declare.

export type Named = { id: string; name: string };
export type Sp5Org = Named & { project: Named };

type Sp5Fixtures = {
  /** Fails the journey on browser console errors, warnings and uncaught exceptions. */
  consoleGuard: ConsoleGuard;
  /** Opens a context with the staff session (SMS second factor done in the setup project). */
  staffPage: Page;
  /** The console guard of `staffPage` (declare intended failures with `allow`). */
  staffConsole: ConsoleGuard;
  /** A fresh organization owned by the seeded owner, with one project, for this test. */
  sp5Org: Sp5Org;
};

const ORG_DEFAULTS = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } as const;

/** Unique, readable names for things a journey creates. */
export const unique = (label: string): string => `${label} ${randomUUID().slice(0, 8)}`;

const guardedPage = async (context: BrowserContext): Promise<{ page: Page; guard: ConsoleGuard }> => {
  const page = await context.newPage();
  return { page, guard: watchConsole(page) };
};

/**
 * Opens a page in a new context with a stored session; its console is checked when the context
 * closes through `close()`.
 */
export const openAs = async (browser: Browser, storage: string | { cookies: []; origins: [] }) => {
  const context = await browser.newContext({ storageState: storage });
  const { page, guard } = await guardedPage(context);
  return {
    page,
    guard,
    close: async (): Promise<void> => {
      await context.close();
      expect(guard.problems(), "browser console errors and warnings").toEqual([]);
    },
  };
};

// The staff page of each `staffConsole` guard (one context per test).
const staffPages = new Map<ConsoleGuard, Page>();

export const test = base.extend<Sp5Fixtures>({
  consoleGuard: [
    async ({ page }, provide) => {
      const guard = watchConsole(page);
      await provide(guard);
      expect(guard.problems(), "browser console errors and warnings").toEqual([]);
    },
    { auto: true },
  ],
  staffConsole: async ({ browser }, provide) => {
    const staff = await openAs(browser, authFile("staff"));
    staffPages.set(staff.guard, staff.page);
    await provide(staff.guard);
    staffPages.delete(staff.guard);
    await staff.close();
  },
  staffPage: async ({ staffConsole }, provide) => {
    const page = staffPages.get(staffConsole);
    if (page === undefined) throw new Error("staff page missing");
    await provide(page);
  },
  sp5Org: async ({ ownerApi }, provide) => {
    const organization = await ownerApi.post<Named>("/v1/organizations", { name: unique("SP5 Org"), defaults: ORG_DEFAULTS });
    const project = await ownerApi.post<Named>(`/v1/organizations/${organization.id}/projects`, { name: unique("SP5 Project") });
    await provide({ id: organization.id, name: organization.name, project: { id: project.id, name: project.name } });
  },
});

/** `/o/{id}/settings/{section}` relative to the pt-BR base URL. */
export const settingsPath = (organizationId: string, section: string, rest?: string): string =>
  `o/${organizationId}/settings/${section}${rest === undefined ? "" : `/${rest}`}`;

/** A table row on wide screens, a card (list item) on phones. */
export const entry = (page: Page, text: string | RegExp) => page.getByRole("row").or(page.getByRole("listitem")).filter({ hasText: text });

export const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notificações/ }).getByText(text);

/** Makes `user` join the organization with `roles` through an owner invitation. */
export const addMember = async (args: { owner: V1Client; user: FreshUser; organizationId: string; roles: RoleRef[] }): Promise<void> => {
  await joinOrganization({ owner: args.owner, member: args.user.api, email: args.user.email, organizationId: args.organizationId, roles: args.roles });
  await args.user.api.put("/v1/me/active-organization", { organizationId: args.organizationId });
};

/**
 * One chat turn through `/v1/chat` as the given user (data the journey starts from: a trace, ledger
 * rows). Reads the stream to its end. Fake models answer (`AI_MODE=fake`).
 */
export const chatTurn = async (api: V1Client, org: Sp5Org, text: string): Promise<string> => {
  const message = { id: randomUUID(), role: "user", parts: [{ type: "text", text }] };
  const response = await api.raw("POST", "/v1/chat", { organizationId: org.id, projectId: org.project.id, message });
  if (response.status !== 200) throw new Error(`POST /v1/chat → ${String(response.status)}`);
  const conversationId = response.headers.get("x-conversation-id") ?? "";
  await response.text();
  return conversationId;
};

/** Console line Chromium writes for a request a journey makes fail on purpose. */
export const FAILED_REQUEST = /Failed to load resource/;

export { expect };
export type { FreshUser };
