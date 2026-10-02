import { ConversationContract } from "@core/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, noContent, ok, page, type FakeApi } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport, textChunks, type FakeChatTransport } from "../testing/fake-chat-transport.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";

const conversation = (overrides: Record<string, unknown> = {}) => ({ ...(ConversationContract.meta.examples[0] as object), id: CONVERSATION_ID, ...overrides });

const stored: UIMessage[] = [
  { id: "u-0", role: "user", parts: [{ type: "text", text: "Qual é o prazo?" }] },
  { id: "a-0", role: "assistant", parts: [{ type: "text", text: "O prazo é de 30 dias." }] },
];

const historyApi = (overrides: Record<string, unknown> = {}): FakeApi =>
  createFakeApi({
    [`GET /v1/conversations/${CONVERSATION_ID}`]: ok(conversation(overrides)),
    [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored),
    [`POST /v1/chat/${CONVERSATION_ID}/stop`]: noContent(),
  });

const setup = (props: Partial<ChatPanelProps> = {}, api?: FakeApi) => {
  const transport = (props.transport as FakeChatTransport | undefined) ?? createFakeChatTransport();
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel scope={SCOPE} {...props} transport={transport} />
    </TooltipProvider>,
    api === undefined ? {} : { api },
  );
  return { ...view, transport, field: () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" }) };
};

const status = (): string => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite")?.textContent ?? "";

const firstStream = async (transport: FakeChatTransport, index = 0) => {
  await waitFor(() => expect(transport.streams.length).toBeGreaterThan(index));
  const stream = transport.streams[index];
  if (stream === undefined) throw new Error("stream not opened");
  return stream;
};

const setOnline = (online: boolean): void => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
};

afterEach(() => {
  setOnline(true);
});

describe("ChatPanel", () => {
  it("opens empty with suggestions and no axe violations", async () => {
    const { container } = setup();
    expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Sugestões" })).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("log", { name: "Conversa com o assistente" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("puts the prompt of a suggestion in the draft to review, and sends it on Enter", async () => {
    const { user, transport, field } = setup();
    await user.click(screen.getByRole("button", { name: /Consultar dados/ }));
    expect(field().value).toBe("Quais dados eu posso consultar?");
    expect(document.activeElement).toBe(field());
    expect(transport.streams).toHaveLength(0);
    await user.keyboard("{Enter}");
    const stream = await firstStream(transport);
    expect(stream.messages.at(-1)).toMatchObject({ role: "user", parts: [{ type: "text", text: "Quais dados eu posso consultar?" }] });
  });

  it("goes from connecting to responding to finished, announcing each step once", async () => {
    const { user, transport, field, container } = setup();
    await user.type(field(), "Qual é o prazo?{Enter}");
    const stream = await firstStream(transport);
    expect(status()).toBe("Conectando…");
    expect(container.querySelector("[data-slot=pending-answer]")).not.toBeNull();
    expect(screen.getByRole("article", { name: "Você" }).textContent).toContain("Qual é o prazo?");

    act(() => stream.emit(...textChunks(["O prazo ", "é de"], { finish: false })));
    await waitFor(() => expect(status()).toBe("Respondendo…"));
    expect(screen.getByRole("article", { name: "Assistente" }).textContent).toContain("O prazo é de");
    expect(container.querySelector("[data-slot=pending-answer]")).toBeNull();
    expect(screen.getByRole("button", { name: "Parar resposta" })).toBeTruthy();
    expect(screen.getByRole("log").getAttribute("aria-live")).toBe("off");
    await expectNoAxeViolations(container);

    act(() => {
      stream.emit({ type: "text-delta", id: "t-1", delta: " 30 dias." }, { type: "text-end", id: "t-1" }, { type: "finish" });
      stream.close();
    });
    await waitFor(() => expect(status()).toBe("Resposta concluída."));
    expect(screen.getByRole("article", { name: "Assistente" }).textContent).toContain("O prazo é de 30 dias.");
    expect(screen.getByRole("button", { name: "Gerar novamente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar resposta" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("stops on Esc, keeps the partial answer and tells the server to stop the run", async () => {
    const api = historyApi();
    const { user, transport, field } = setup({ conversationId: CONVERSATION_ID }, api);
    await waitFor(() => expect(screen.getByText("O prazo é de 30 dias.")).toBeTruthy());
    await user.type(field(), "E a multa?{Enter}");
    const stream = await firstStream(transport);
    act(() => stream.emit(...textChunks(["A multa é"], { finish: false, messageId: "a-9" })));
    await waitFor(() => expect(status()).toBe("Respondendo…"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(status()).toBe("Resposta interrompida."));
    expect(stream.aborted()).toBe(true);
    expect(screen.getByText("A multa é")).toBeTruthy();
    expect(screen.getByText("Interrompido")).toBeTruthy();
    expect(api.callLines()).toContain(`POST /v1/chat/${CONVERSATION_ID}/stop`);
    expect(document.activeElement).toBe(field());
    expect(screen.getByRole("button", { name: "Enviar mensagem" })).toBeTruthy();
  });

  it("stops with the stop button and with Esc from outside the composer", async () => {
    const { user, transport, field } = setup();
    await user.type(field(), "oi{Enter}");
    const first = await firstStream(transport);
    act(() => first.emit(...textChunks(["Olá"], { finish: false })));
    await user.click(await screen.findByRole("button", { name: "Parar resposta" }));
    await waitFor(() => expect(first.aborted()).toBe(true));

    await user.type(field(), "de novo{Enter}");
    const second = await firstStream(transport, 1);
    act(() => second.emit(...textChunks(["Olá de novo"], { finish: false, messageId: "a-2" })));
    await waitFor(() => expect(status()).toBe("Respondendo…"));
    screen.getByRole("log").focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(second.aborted()).toBe(true));
  });

  it("loads a stored conversation and does not resume when no run is active", async () => {
    const { transport, container } = setup({ conversationId: CONVERSATION_ID }, historyApi());
    expect(screen.getByRole("status").textContent).toContain("Carregando conversa…");
    await waitFor(() => expect(screen.getByText("O prazo é de 30 dias.")).toBeTruthy());
    expect(transport.resumeCalls()).toBe(0);
    await expectNoAxeViolations(container);
  });

  it("tells the host each time a turn settles, so what it shows about the conversation can be read again", async () => {
    const onTurnSettled = vi.fn();
    const { user, transport, field } = setup({ onTurnSettled });
    await user.type(field(), "Qual é o prazo?{Enter}");
    const stream = await firstStream(transport);
    act(() => stream.emit(...textChunks(["O prazo "], { finish: false })));
    await waitFor(() => expect(status()).toBe("Respondendo…"));
    expect(onTurnSettled).not.toHaveBeenCalled();
    act(() => {
      stream.emit({ type: "text-end", id: "t-1" }, { type: "finish" });
      stream.close();
    });
    await waitFor(() => expect(onTurnSettled).toHaveBeenCalledTimes(1));
  });

  it("resumes the answer on mount when the conversation has an active run", async () => {
    const transport = createFakeChatTransport();
    transport.resumable = true;
    setup({ conversationId: CONVERSATION_ID, transport }, historyApi({ activeRunId: "run-7", activeStreamStartedAt: "2026-09-30T12:00:00.000Z" }));
    const stream = await firstStream(transport);
    expect(stream.trigger).toBe("resume");
    expect(transport.resumeCalls()).toBe(1);
    await waitFor(() => expect(status()).toBe("Retomando resposta…"));
    act(() => {
      stream.emit(...textChunks(["Continuando a resposta."], { messageId: "a-7" }));
      stream.close();
    });
    await waitFor(() => expect(screen.getByText("Continuando a resposta.")).toBeTruthy());
    await waitFor(() => expect(status()).toBe("Resposta concluída."));
  });

  it("says a missing conversation is not found and offers a retry when the history fails", async () => {
    const missing = setup({ conversationId: CONVERSATION_ID }, createFakeApi());
    expect(await screen.findByText("Conversa não encontrada")).toBeTruthy();
    missing.unmount();

    const api = createFakeApi({ [`GET /v1/conversations/${CONVERSATION_ID}`]: apiError(500, "INTERNAL_ERROR"), [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored) });
    const { user, container } = setup({ conversationId: CONVERSATION_ID }, api);
    expect(await screen.findByText("Não foi possível carregar a conversa.", undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/Referência/)).toBeTruthy();
    await expectNoAxeViolations(container);
    api.route(`GET /v1/conversations/${CONVERSATION_ID}`, ok(conversation()));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("O prazo é de 30 dias.")).toBeTruthy();
  });

  it("shows the error with its reason, the request reference and a retry that sends again", async () => {
    const { user, transport, field, container } = setup();
    transport.failNextSend(new ApiError({ status: 429, code: "RATE_LIMITED", message: "Too many requests.", requestId: "01K6REQ429" }));
    await user.type(field(), "oi{Enter}");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Não foi possível responder")).toBeTruthy();
    expect(alert.textContent).toContain("01K6REQ429");
    expect(alert.textContent).not.toContain("Too many requests.");
    await expectNoAxeViolations(container);

    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    const stream = await firstStream(transport);
    expect(stream.messages.at(-1)).toMatchObject({ role: "user", parts: [{ type: "text", text: "oi" }] });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a failed stream as an error without a raw message", async () => {
    const { user, transport, field } = setup();
    await user.type(field(), "oi{Enter}");
    const stream = await firstStream(transport);
    act(() => stream.emit({ type: "start", messageId: "a-1" }, { type: "error", errorText: "provider exploded: sk-secret" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A resposta falhou antes de terminar. Tente de novo.");
    expect(alert.textContent).not.toContain("sk-secret");
  });

  it("marks a lost stream, keeps what arrived and retries", async () => {
    const { user, transport, field } = setup();
    await user.type(field(), "oi{Enter}");
    const stream = await firstStream(transport);
    act(() => stream.emit(...textChunks(["Metade da"], { finish: false })));
    await waitFor(() => expect(status()).toBe("Respondendo…"));
    act(() => stream.fail(new TypeError("network error")));
    await waitFor(() => expect(status()).toBe("Conexão perdida. A resposta parou antes do fim."));
    expect(screen.getByText("Metade da")).toBeTruthy();
    expect(screen.getByText("Interrompido")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await firstStream(transport, 1);
  });

  it("says it is offline, keeps the draft and blocks sending until the connection is back", async () => {
    const { user, transport, field, container } = setup();
    setOnline(false);
    // Said once under the field (and by the shell banner), not again in the status line.
    expect(await screen.findByText("Sem conexão. Envio indisponível até a conexão voltar.")).toBeTruthy();
    expect(status()).toBe("");
    await user.type(field(), "rascunho{Enter}");
    expect(transport.streams).toHaveLength(0);
    expect(field().value).toBe("rascunho");
    await expectNoAxeViolations(container);
    setOnline(true);
    await waitFor(() => expect(status()).toBe(""));
    await user.type(field(), "{Enter}");
    await firstStream(transport);
  });

  it("offers a retry when the send failed for lack of network", async () => {
    const { user, transport, field } = setup();
    transport.failNextSend(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Network request failed.", requestId: "req-1" }));
    await user.type(field(), "oi{Enter}");
    await waitFor(() => expect(status()).toBe("Sem conexão."));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await firstStream(transport);
  });

  it("shows a tripwire and a low-confidence answer from the stream", async () => {
    const { user, transport, field, container } = setup();
    await user.type(field(), "oi{Enter}");
    const stream = await firstStream(transport);
    act(() => {
      stream.emit(
        { type: "start", messageId: "a-1", messageMetadata: { confidence: "low" } },
        { type: "data-tripwire", data: { reason: "BUDGET_EXCEEDED", metadata: { processorId: "tenant-budget-guard" } } },
        { type: "text-start", id: "t-1" },
        { type: "text-delta", id: "t-1", delta: "Não encontrei fonte." },
        { type: "text-end", id: "t-1" },
        { type: "finish" },
      );
      stream.close();
    });
    expect(await screen.findByText("Resposta bloqueada")).toBeTruthy();
    expect(await screen.findByText("Sem certeza")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("starts a new conversation, focuses the composer and tells the owner of the URL", async () => {
    const onConversationChange = vi.fn();
    const { user, transport, field } = setup({ onConversationChange });
    await user.type(field(), "oi{Enter}");
    const stream = await firstStream(transport);
    act(() => {
      stream.emit(...textChunks(["Olá."]));
      stream.close();
    });
    await waitFor(() => expect(screen.getByText("Olá.")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Nova conversa" }));
    expect(screen.queryByText("Olá.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(onConversationChange).toHaveBeenLastCalledWith(undefined);
  });

  it("switches thread when the owner navigates to another conversation", async () => {
    const api = historyApi();
    const { rerender, transport } = setup({}, api);
    expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeTruthy();
    rerender(
      <TooltipProvider>
        <ChatPanel scope={SCOPE} conversationId={CONVERSATION_ID} transport={transport} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("O prazo é de 30 dias.")).toBeTruthy();
  });

  it("resumes an answer whose first steps are already stored without showing them twice", async () => {
    // Memory stores an answer step by step, and the resumed stream replays the run from its
    // start under the same message id: the stored copy of the answer in flight must give way.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = historyApi({ activeRunId: "run-7", activeStreamStartedAt: "2026-09-30T12:00:00.000Z" });
    const partial: UIMessage = { id: "a-7", role: "assistant", parts: [{ type: "text", text: "Primeira etapa." }] };
    api.route(`GET /v1/conversations/${CONVERSATION_ID}/messages`, page([...stored, { id: "u-7", role: "user", parts: [{ type: "text", text: "E depois?" }] }, partial]));
    const transport = createFakeChatTransport();
    transport.resumable = true;
    setup({ conversationId: CONVERSATION_ID, transport }, api);
    const stream = await firstStream(transport);
    expect(stream.trigger).toBe("resume");
    expect(await screen.findByText("E depois?")).toBeTruthy();
    expect(screen.queryByText("Primeira etapa.")).toBeNull();
    act(() => {
      stream.emit(...textChunks(["Primeira etapa. ", "Segunda etapa."], { messageId: "a-7" }));
      stream.close();
    });
    await waitFor(() => expect(status()).toBe("Resposta concluída."));
    const answers = screen.getAllByRole("article", { name: "Assistente" });
    expect(answers).toHaveLength(2);
    expect(answers[1]?.textContent).toContain("Primeira etapa. Segunda etapa.");
    expect(answers[1]?.textContent?.match(/Primeira etapa/g)).toHaveLength(1);
    expect(errors.mock.calls.filter((call) => String(call[0]).includes("same key"))).toEqual([]);
    errors.mockRestore();
  });

  it("loads earlier messages on demand", async () => {
    const api = historyApi();
    const older: UIMessage[] = [{ id: "u-old", role: "user", parts: [{ type: "text", text: "Mensagem antiga" }] }];
    api.route(`GET /v1/conversations/${CONVERSATION_ID}/messages`, ({ query }) => (query.get("cursor") === "1" ? page(older) : page(stored, { cursor: "1" })));
    const { user } = setup({ conversationId: CONVERSATION_ID }, api);
    await user.click(await screen.findByRole("button", { name: "Carregar mensagens anteriores" }));
    expect(await screen.findByText("Mensagem antiga")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mensagens anteriores" })).toBeNull();
    const articles = screen.getAllByRole("article");
    expect(articles[0]?.textContent).toContain("Mensagem antiga");
  });
});
