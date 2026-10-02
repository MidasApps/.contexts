import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, ok, page, type FakeApi } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { Toaster } from "#/shared/ui/molecules/Toaster/Toaster.tsx";
import { buildConversation, routeConversationsApi, type ConversationsStore } from "../testing/conversations-api.fixture.ts";
import { ChatHistorySidebar, type ChatHistorySidebarProps } from "./chat-history-sidebar.tsx";

const A = "CvA000000000000000001";
const B = "CvB000000000000000002";
const C = "CvC000000000000000003";

const seed = (): ConversationsStore => ({
  summaryText: "Plano de integração em três etapas.",
  items: [
    buildConversation(A, { title: "Plano de integração", lastMessageAt: "2026-09-30T12:00:00.000Z" }),
    buildConversation(B, { title: "Dúvidas de faturamento", lastMessageAt: "2026-09-29T12:00:00.000Z" }),
    buildConversation(C, { title: "Contrato antigo", archivedAt: "2026-09-01T00:00:00.000Z", lastMessageAt: "2026-08-01T12:00:00.000Z" }),
  ],
});

const setup = (props: Partial<ChatHistorySidebarProps> = {}, store: ConversationsStore = seed(), api: FakeApi = createFakeApi()) => {
  routeConversationsApi(api, store);
  const view = renderWithClient(
    <TooltipProvider>
      <ChatHistorySidebar organizationId={IDS.organization} projectId={IDS.project} {...props} />
      <Toaster />
    </TooltipProvider>,
    { api },
  );
  const titles = () => within(screen.getByRole("list", { name: "Histórico de conversas" })).getAllByRole("link").map((link) => link.textContent);
  const openMenu = async (title: string) => view.user.click(await screen.findByRole("button", { name: `Ações de ${title}` }));
  return { ...view, api, store, titles, openMenu };
};

// The first render of a file and a debounced search wait on the network of the fake API.
const LOADED = { timeout: 5000 };

const setOnline = (online: boolean): void => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
};

afterEach(() => setOnline(true));

describe("ChatHistorySidebar", () => {
  it("names the organization's agent of a conversation, and nothing for the assistant", async () => {
    const store = seed();
    store.items[0] = buildConversation(A, { title: "Plano de integração", agentId: "Ag4sK2lPq0WnR5tYu3bV" });
    store.items[1] = buildConversation(B, { title: "Dúvidas de faturamento", agentId: "AgGone00000000000001" });
    const api = createFakeApi({ "GET /v1/chat-agents": ok([{ id: "Ag4sK2lPq0WnR5tYu3bV", name: "Onboarding guide", description: "", source: "custom" }]) });
    setup({}, store, api);
    const first = (await screen.findByRole("link", { name: "Plano de integração" }, LOADED)).closest("li");
    await waitFor(() => expect(first?.querySelector("[data-slot=conversation-agent]")?.textContent).toBe("Onboarding guide"));
    const second = screen.getByRole("link", { name: "Dúvidas de faturamento" }).closest("li");
    expect(second?.querySelector("[data-slot=conversation-agent]")?.textContent).toBe("Agente da organização");
  });

  it("shows no agent for conversations with the assistant", async () => {
    setup();
    const first = (await screen.findByRole("link", { name: "Plano de integração" }, LOADED)).closest("li");
    expect(first?.querySelector("[data-slot=conversation-agent]")).toBeNull();
  });

  it("lists the active conversations, most recent first, linking each to its chat route", async () => {
    const { container, titles } = setup({ activeConversationId: A });
    const first = await screen.findByRole("link", { name: "Plano de integração" }, LOADED);
    expect(titles()).toEqual(["Plano de integração", "Dúvidas de faturamento"]);
    expect(first.getAttribute("href")).toBe(`/o/${IDS.organization}/p/${IDS.project}/chat/${A}`);
    expect(first.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Nova conversa" }).getAttribute("href")).toBe(`/o/${IDS.organization}/p/${IDS.project}/chat`);
    expect(screen.getByText("2 conversas").getAttribute("role")).toBe("status");
    await expectNoAxeViolations(container);
  });

  it("does not count only the loaded rows as the total while more conversations exist", async () => {
    const api = createFakeApi({ "GET /v1/conversations": page([buildConversation(A, { title: "Plano de integração" }), buildConversation(B, { title: "Dúvidas de faturamento" })], { cursor: "next" }) });
    renderWithClient(
      <TooltipProvider>
        <ChatHistorySidebar organizationId={IDS.organization} projectId={IDS.project} />
      </TooltipProvider>,
      { api },
    );
    await screen.findByRole("link", { name: "Plano de integração" }, LOADED);
    expect(screen.getByRole("button", { name: "Carregar mais conversas" })).toBeTruthy();
    expect(document.querySelector("[data-slot=history-count]")?.textContent).toBe("Mostrando 2 conversas");
  });

  it("shows a loading state, then an empty state with no conversations", async () => {
    const { container } = setup({}, { summaryText: "", items: [] });
    expect(screen.getAllByRole("status").some((node) => node.textContent?.includes("Carregando conversas…"))).toBe(true);
    expect(await screen.findByRole("heading", { name: "Nenhuma conversa ainda" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("searches on the server once typing pauses, not on every key", async () => {
    const { user, api, titles } = setup();
    await screen.findByRole("link", { name: "Plano de integração" });
    await user.type(screen.getByRole("searchbox", { name: "Buscar conversas" }), "fatura");
    await waitFor(() => expect(titles()).toEqual(["Dúvidas de faturamento"]), LOADED);
    const searched = api.calls.filter((call) => call.path === "/v1/conversations").map((call) => new URLSearchParams(call.query).get("q"));
    expect(searched).toEqual([null, "fatura"]);
  });

  it("says when a search finds nothing", async () => {
    const { user } = setup();
    await screen.findByRole("link", { name: "Plano de integração" });
    await user.type(screen.getByRole("searchbox", { name: "Buscar conversas" }), "zzz");
    expect(await screen.findByText("Nenhuma conversa corresponde a “zzz”.")).toBeTruthy();
  });

  it("renames a conversation inline: Enter saves, Esc cancels, and the focus returns to the row", async () => {
    const { user, openMenu, store } = setup();
    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Renomear" }));
    const field = await screen.findByRole("textbox", { name: "Novo título de Plano de integração" });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: /Novo título/ })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Plano de integração" })));

    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Renomear" }));
    const again = await screen.findByRole("textbox", { name: "Novo título de Plano de integração" });
    await user.clear(again);
    await user.type(again, "Onboarding{Enter}");
    expect(await screen.findByRole("link", { name: "Onboarding" })).toBeTruthy();
    expect(store.items.find((item) => item.id === A)?.title).toBe("Onboarding");
  });

  it("keeps the rename form open and says why when the title is empty or the save fails", async () => {
    const { user, openMenu, api } = setup();
    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Renomear" }));
    const field = await screen.findByRole("textbox", { name: "Novo título de Plano de integração" });
    await user.clear(field);
    await user.keyboard("{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("Informe um título.");
    api.route("PATCH /v1/conversations/:conversationId", apiError(500, "INTERNAL_ERROR"));
    await user.type(field, "Outro{Enter}");
    await waitFor(() => expect(screen.getByRole("alert").textContent).not.toBe("Informe um título."));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Novo título de Plano de integração" }).value).toBe("Outro");
  });

  it("pins a conversation, which moves it to the top and labels it", async () => {
    const { user, openMenu, titles } = setup();
    await openMenu("Dúvidas de faturamento");
    await user.click(await screen.findByRole("menuitem", { name: "Fixar" }));
    await waitFor(() => expect(titles()).toEqual(["Dúvidas de faturamento", "Plano de integração"]));
    expect(screen.getByText("Fixada")).toBeTruthy();
    expect(await screen.findByText("Conversa fixada.")).toBeTruthy();
    await openMenu("Dúvidas de faturamento");
    expect(await screen.findByRole("menuitem", { name: "Desafixar" })).toBeTruthy();
  });

  it("locks pin and archive of a row until its change has settled, so a second click cannot undo it", async () => {
    const { user, openMenu, api } = setup();
    await screen.findByRole("link", { name: "Dúvidas de faturamento" }, LOADED);
    let finish: () => void = () => undefined;
    api.route("PATCH /v1/conversations/:conversationId", () => new Promise((resolve) => (finish = () => resolve(ok(buildConversation(B, { title: "Dúvidas de faturamento", pinned: true }))))));
    await openMenu("Dúvidas de faturamento");
    await user.click(await screen.findByRole("menuitem", { name: "Fixar" }));
    await openMenu("Dúvidas de faturamento");
    expect((await screen.findByRole("menuitem", { name: "Fixar" })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Arquivar" }).getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{Escape}");
    finish();
    expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  });

  it("archives a conversation out of the list and shows it under the archived filter, where it can be restored", async () => {
    const { user, openMenu, titles } = setup();
    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Arquivar" }));
    await waitFor(() => expect(titles()).toEqual(["Dúvidas de faturamento"]));
    const toggle = screen.getByRole("button", { name: "Arquivadas" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(titles()).toEqual(["Plano de integração", "Contrato antigo"]));
    await openMenu("Contrato antigo");
    await user.click(await screen.findByRole("menuitem", { name: "Restaurar" }));
    await waitFor(() => expect(titles()).toEqual(["Plano de integração"]));
  });

  it("deletes only after confirmation and tells the owner which conversation went away", async () => {
    const onDeleted = vi.fn();
    const { user, openMenu, api, titles } = setup({ onDeleted });
    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Excluir" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir “Plano de integração”?" });
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);

    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Excluir" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir conversa" }));
    await waitFor(() => expect(titles()).toEqual(["Dúvidas de faturamento"]));
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(A);
  });

  it("summarizes a conversation and shows the summary", async () => {
    const { user, openMenu, api } = setup();
    await openMenu("Plano de integração");
    await user.click(await screen.findByRole("menuitem", { name: "Resumir" }));
    const dialog = await screen.findByRole("dialog", { name: "Resumo de Plano de integração" });
    expect(await within(dialog).findByText("Plano de integração em três etapas.")).toBeTruthy();
    await user.click(within(dialog).getAllByRole("button", { name: "Fechar" })[0] as HTMLElement);

    api.route("POST /v1/conversations/:conversationId/summary", apiError(409, "CONFLICT"));
    await openMenu("Dúvidas de faturamento");
    await user.click(await screen.findByRole("menuitem", { name: "Resumir" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ainda não há mensagens para resumir.");
  });

  it("shows no-permission, a failure with a retry, and the offline notice", async () => {
    const forbidden = createFakeApi();
    const first = setup({}, seed(), forbidden);
    forbidden.route("GET /v1/conversations", apiError(403, "FORBIDDEN"));
    await first.user.click(screen.getByRole("button", { name: "Arquivadas" }));
    expect(await screen.findByText("Você não tem permissão para ver o histórico de conversas.")).toBeTruthy();
    first.unmount();

    const failing = createFakeApi();
    const store = seed();
    const second = setup({}, store, failing);
    failing.route("GET /v1/conversations", apiError(500, "INTERNAL_ERROR"));
    await second.user.click(screen.getByRole("button", { name: "Arquivadas" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referência");
    routeConversationsApi(failing, store);
    await second.user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: "Contrato antigo" })).toBeTruthy();

    setOnline(false);
    expect(await screen.findByText(/sem conexão/i)).toBeTruthy();
    await expectNoAxeViolations(second.container);
  });
});
