import { defineContract, defineModule } from "@core/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppLayout } from "#/app-shell/app-layout.tsx";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildConversation } from "#/widgets/chat-history-sidebar/testing/conversations-api.fixture.ts";
import { CHAT_SHELL_SLOTS, useChatEnvironment } from "#/widgets/chat-panel/index.ts";
import { ChatView } from "./chat-view.tsx";

const A = "CvA000000000000000001";
const PATH = `/o/${IDS.organization}/p/${IDS.project}/chat`;
const CHAT_PERMISSIONS = [...MEMBER_PERMISSIONS, "core.conversation.send", "core.conversation.read", "core.file.upload"];
const LOADED = { timeout: 5000 };

const stored: UIMessage[] = [
  { id: "u-0", role: "user", parts: [{ type: "text", text: "Qual é o prazo?" }] },
  { id: "a-0", role: "assistant", parts: [{ type: "text", text: "O prazo é de 30 dias." }] },
];

const chatRoutes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/conversations": page([buildConversation(A, { title: "Plano de integração" })]),
  [`GET /v1/conversations/${A}`]: ok(buildConversation(A, { title: "Plano de integração" })),
  [`GET /v1/conversations/${A}/messages`]: page(stored),
  ...overrides,
});

const renderView = (options: { path?: string; permissions?: readonly string[] } = {}) =>
  renderApp(
    <main>
      <ChatView />
    </main>,
    { path: options.path ?? PATH, routes: shellRoutes(options.permissions ?? CHAT_PERMISSIONS, chatRoutes()) },
  );

describe("ChatView", () => {
  it("composes the history and the chat panel for a new conversation", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Chat" }, LOADED)).toBeTruthy();
    const history = screen.getByRole("navigation", { name: "Conversas" });
    expect(await within(history).findByRole("link", { name: "Plano de integração" }, LOADED)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Assistente" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeTruthy();
    // The member may upload: the composer offers the attach menu (permissions reach the panel).
    expect(screen.getByRole("button", { name: "Anexar" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("opens the conversation named in the URL and marks it in the history", async () => {
    renderView({ path: `${PATH}/${A}` });
    expect(await screen.findByText("O prazo é de 30 dias.", {}, LOADED)).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Plano de integração" }, LOADED);
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("follows a history link to its conversation and 'new conversation' back to an empty chat", async () => {
    const { user, router } = renderView();
    await user.click(await screen.findByRole("link", { name: "Plano de integração" }, LOADED));
    expect(await screen.findByText("O prazo é de 30 dias.", {}, LOADED)).toBeTruthy();
    await user.click(within(screen.getByRole("navigation", { name: "Conversas" })).getByRole("link", { name: "Nova conversa" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeTruthy());
    expect(router.current()).toBe(PATH);
  });

  it("is forbidden without the chat permission and not found outside a project", async () => {
    const forbidden = renderView({ permissions: MEMBER_PERMISSIONS });
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" }, LOADED)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
    forbidden.unmount();
    renderView({ path: `/o/${IDS.organization}` });
    expect(await screen.findByRole("heading", { name: "Página não encontrada" }, LOADED)).toBeTruthy();
  });
});

describe("chat in the shell's right panel", () => {
  const renderShell = (path: string, permissions: readonly string[] = CHAT_PERMISSIONS) =>
    renderApp(
      <AppLayout>
        <h1>Página</h1>
      </AppLayout>,
      { path, slots: CHAT_SHELL_SLOTS, routes: shellRoutes(permissions, chatRoutes()) },
    );

  it("opens from the topbar inside a project, starts closed and lists the chat in the navigation", async () => {
    const { user } = renderShell(`/o/${IDS.organization}/p/${IDS.project}`);
    const nav = await screen.findByRole("navigation", { name: "Navegação" }, LOADED);
    expect((await within(nav).findByRole("link", { name: "Chat" }, LOADED)).getAttribute("href")).toBe(PATH);
    const toggle = await screen.findByRole("button", { name: "Assistente" }, LOADED);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const panel = screen.getByRole("complementary", { name: "Painel lateral" });
    expect(within(panel).getByRole("textbox", { name: "Mensagem" })).toBeTruthy();
  });

  it("is not offered on the chat page, outside a project or without the permission", async () => {
    const onChat = renderShell(PATH);
    await screen.findByRole("button", { name: "Ana Souza, menu da conta" }, LOADED);
    await act(() => Promise.resolve());
    expect(screen.queryByRole("button", { name: "Assistente" })).toBeNull();
    onChat.unmount();
    const organization = renderShell(`/o/${IDS.organization}`);
    await screen.findByRole("button", { name: "Ana Souza, menu da conta" }, LOADED);
    expect(screen.queryByRole("button", { name: "Assistente" })).toBeNull();
    organization.unmount();
    renderShell(`/o/${IDS.organization}/p/${IDS.project}`, MEMBER_PERMISSIONS);
    const nav = await screen.findByRole("navigation", { name: "Navegação" }, LOADED);
    await within(nav).findByRole("link", { name: "Visão geral" }, LOADED);
    expect(screen.queryByRole("button", { name: "Assistente" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Chat" })).toBeNull();
  });
});

describe("useChatEnvironment (SP0 follow-up #41)", () => {
  const NoteCommand = defineContract(z.strictObject({ title: z.string().min(1).meta({ description: "Title.", pii: "none" }) }), {
    id: "samplenotes.CreateNoteCommand",
    kind: "command",
    description: "Creates a sample note.",
    examples: [{ title: "A" }],
    pii: "none",
    tenancyScope: "organization",
    relations: [],
    permission: "samplenotes.note.create",
  });
  const sampleModule = defineClientModule({
    manifest: defineModule({ id: "samplenotes", labelKey: "samplenotes.module.name", permissions: [], messages: { "pt-BR": { module: { name: "Notas" } } } }),
    pages: {},
    contracts: [NoteCommand],
  });

  function Probe() {
    const environment = useChatEnvironment({ organizationId: IDS.organization, projectId: IDS.project });
    return (
      <dl>
        <dt>contracts</dt>
        <dd data-testid="contracts">{environment.contracts.map((contract) => contract.id).join(",")}</dd>
        <dd data-testid="approval">{environment.approvalHref("Ap1")}</dd>
        <dd data-testid="currency">{environment.defaultCurrency ?? "…"}</dd>
        <dd data-testid="can">{String(environment.can("core.conversation.send"))}</dd>
      </dl>
    );
  }

  it("gives the panel the module contracts, the approvals link, the currency and the permissions of the node", async () => {
    renderApp(<Probe />, { path: PATH, modules: [sampleModule], routes: shellRoutes(CHAT_PERMISSIONS, chatRoutes()) });
    await waitFor(() => expect(screen.getByTestId("can").textContent).toBe("true"), LOADED);
    expect(screen.getByTestId("contracts").textContent).toBe("samplenotes.CreateNoteCommand");
    expect(screen.getByTestId("approval").textContent).toBe(`/o/${IDS.organization}/settings/approvals/Ap1`);
    expect(screen.getByTestId("currency").textContent).toBe("BRL");
  });
});
