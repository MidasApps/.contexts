import { ConversationContract } from "@core/contracts";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createFakeTransfers, routeFilesApi, storedFile } from "#/features/chat-upload/testing/fake-upload.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createFakeApi, type FakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport, type FakeChatTransport } from "../testing/fake-chat-transport.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const FILE_A = "FileA000000000000001";
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";
const MEMBER = new Set(["core.file.upload"]);

const setup = (
  props: Partial<ChatPanelProps> = {},
  api: FakeApi = createFakeApi(),
  granted: ReadonlySet<string> = MEMBER,
) => {
  const transport = createFakeChatTransport();
  const { transfers, createRequest } = createFakeTransfers();
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel
        scope={SCOPE}
        can={(permission) => granted.has(permission)}
        uploadSeams={{
          transfer: { createRequest },
          wait: { sleep: () => Promise.resolve() },
          previews: { create: () => "blob:preview", revoke: () => undefined },
        }}
        {...props}
        transport={transport}
      />
    </TooltipProvider>,
    { api },
  );
  const field = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" });
  const transfer = async (index = 0) => {
    await waitFor(() => expect(transfers.length).toBeGreaterThan(index));
    const found = transfers[index];
    if (found === undefined) throw new Error("transfer not started");
    return found;
  };
  return { ...view, transport, transfers, transfer, field, api };
};

const firstStream = async (transport: FakeChatTransport) => {
  await waitFor(() => expect(transport.streams.length).toBeGreaterThan(0));
  const stream = transport.streams[0];
  if (stream === undefined) throw new Error("stream not opened");
  return stream;
};

const png = (name = "diagram.png") => new File(["12345"], name, { type: "image/png" });
const chips = () => screen.getByRole("list", { name: "Anexos da mensagem" });

describe("ChatPanel uploads", () => {
  it("offers no attach menu without the upload permission", () => {
    setup({}, createFakeApi(), new Set());
    expect(screen.queryByRole("button", { name: "Anexar" })).toBeNull();
    expect(screen.queryByLabelText("Arquivos para anexar")).toBeNull();
  });

  it("uploads a picked file, holds the message until it is ready, then sends it by file id", async () => {
    const api = createFakeApi();
    routeFilesApi(api, [FILE_A], {
      files: {
        [FILE_A]: [
          ok(
            storedFile(FILE_A, {
              purpose: "chat-attachment",
              fileName: "diagram.png",
              contentType: "image/png",
              sizeBytes: 5,
            }),
          ),
        ],
      },
    });
    const { user, transport, transfer, field, container } = setup({}, api);
    expect(screen.getByRole("button", { name: "Anexar" })).toBeTruthy();
    await user.upload(screen.getByLabelText("Arquivos para anexar"), png());
    const sent = await transfer();
    act(() => sent.progress(2, 5));
    expect(await within(chips()).findByText("Enviando 40%")).toBeTruthy();

    await user.type(field(), "Veja o diagrama{Enter}");
    expect(transport.streams).toHaveLength(0);
    expect(screen.getByText("Aguarde o envio dos anexos terminar.")).toBeTruthy();
    expect(field().value).toBe("Veja o diagrama");

    act(() => sent.finish());
    expect(await within(chips()).findByText("Pronto")).toBeTruthy();
    expect(screen.getByText("diagram.png: pronto.")).toBeTruthy();
    await expectNoAxeViolations(container);

    await user.type(field(), "{Enter}");
    const stream = await firstStream(transport);
    expect(stream.body).toEqual({ attachments: [FILE_A] });
    expect(stream.messages.at(-1)).toMatchObject({
      role: "user",
      metadata: { attachments: [{ fileId: FILE_A, name: "diagram.png", mediaType: "image/png", sizeBytes: 5 }] },
    });
    // The chip left the composer and the sent message lists the file.
    expect(screen.queryByRole("list", { name: "Anexos da mensagem" })).toBeNull();
    const sentFiles = screen.getByRole("list", { name: "Anexos" });
    expect(within(sentFiles).getByText("diagram.png")).toBeTruthy();
    expect(within(sentFiles).getByText("5 bytes")).toBeTruthy();
    expect(field().value).toBe("");
    // A sent file opens through a short-lived read URL, fetched only when asked.
    api.route(
      `GET /v1/files/${FILE_A}/read-url`,
      ok({ url: "https://storage.test/diagram.png?sig=1", expiresAt: "2026-10-01T12:05:00.000Z" }),
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(within(sentFiles).getByRole("button", { name: "Abrir diagram.png" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://storage.test/diagram.png?sig=1", "_blank", "noopener,noreferrer"),
    );
    open.mockRestore();
  });

  it("says why the server rejected a file and never sends it", async () => {
    const api = createFakeApi();
    routeFilesApi(api, [FILE_A], {
      files: { [FILE_A]: [ok(storedFile(FILE_A, { status: "rejected", rejectionReason: "CONTENT_MISMATCH" }))] },
    });
    const { user, transport, transfer, field } = setup({}, api);
    await user.upload(screen.getByLabelText("Arquivos para anexar"), png("renamed.png"));
    act(() => void transfer().then((sent) => sent.finish()));
    expect(await within(chips()).findByText("O conteúdo não corresponde ao tipo do arquivo")).toBeTruthy();

    await user.type(field(), "oi{Enter}");
    expect(transport.streams).toHaveLength(0);
    expect(screen.getByText("Remova ou reenvie os anexos com erro antes de enviar.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remover renamed.png" }));
    await user.type(field(), "{Enter}");
    const stream = await firstStream(transport);
    expect(stream.body).toBeUndefined();
    expect(stream.messages.at(-1)?.metadata).toBeUndefined();
  });

  it("attaches files pasted into the field or dropped on the composer, and keeps pasted text as text", async () => {
    const api = createFakeApi();
    routeFilesApi(api, [FILE_A, "FileB000000000000002"]);
    const { field } = setup({}, api);
    fireEvent.paste(field(), { clipboardData: { files: [png("pasted.png")], types: ["Files"] } });
    expect(await within(chips()).findByText("pasted.png")).toBeTruthy();
    const composer = field().closest("form") as HTMLFormElement;
    fireEvent.dragOver(composer, { dataTransfer: { files: [], types: ["Files"] } });
    expect(composer.getAttribute("data-dragging")).toBe("true");
    fireEvent.drop(composer, { dataTransfer: { files: [png("dropped.png")], types: ["Files"] } });
    expect(await within(chips()).findByText("dropped.png")).toBeTruthy();
    expect(composer.hasAttribute("data-dragging")).toBe(false);
    fireEvent.paste(field(), { clipboardData: { files: [], types: ["text/plain"] } });
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("ignores pasted files without the upload permission", async () => {
    const { field } = setup({}, createFakeApi(), new Set());
    fireEvent.paste(field(), { clipboardData: { files: [png("pasted.png")], types: ["Files"] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("list", { name: "Anexos da mensagem" })).toBeNull();
  });

  it("offers a retry after a failed transfer and cancels an upload in flight", async () => {
    const api = createFakeApi();
    routeFilesApi(api, [FILE_A, "FileB000000000000002"]);
    const { user, transfer } = setup({}, api);
    await user.upload(screen.getByLabelText("Arquivos para anexar"), png());
    act(() => void transfer(0).then((sent) => sent.fail()));
    expect(await within(chips()).findByText("Falha no envio")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar de novo: diagram.png" }));
    const second = await transfer(1);
    await user.click(screen.getByRole("button", { name: "Cancelar envio de diagram.png" }));
    expect(second.aborted()).toBe(true);
    expect(screen.queryByRole("list", { name: "Anexos da mensagem" })).toBeNull();
  });

  it("adds a document to the knowledge base for a member who may write it", async () => {
    const api = createFakeApi();
    routeFilesApi(api, [FILE_A]);
    api.route(`POST /v1/organizations/${IDS.organization}/knowledge/sources`, {
      status: 202,
      body: { data: { runId: "run-1" } },
    });
    const { user, transfer, transport, field } = setup({}, api, new Set(["core.file.upload", "core.knowledge.write"]));
    await user.upload(
      screen.getByLabelText("Arquivos para a base de conhecimento"),
      new File(["# Guia"], "guia.md", { type: "text/markdown" }),
    );
    const sent = await transfer();
    // The document does not travel with the message, so it never holds the message back.
    await user.type(field(), "Resuma o guia");
    expect(screen.queryByText("Aguarde o envio dos anexos terminar.")).toBeNull();
    expect(screen.getByRole("button", { name: "Enviar mensagem" }).hasAttribute("disabled")).toBe(false);
    act(() => sent.finish());
    expect(
      await within(chips()).findByText("Enviado à base de conhecimento. A indexação continua em segundo plano."),
    ).toBeTruthy();
    expect(api.calls.find((call) => call.path.endsWith("/knowledge/sources"))?.body).toEqual({
      kind: "file",
      fileId: FILE_A,
    });
    // Once the message goes, the finished document leaves the composer.
    await user.keyboard("{Enter}");
    const stream = await firstStream(transport);
    expect(stream.messages.at(-1)?.metadata).toBeUndefined();
    expect(screen.queryByRole("list", { name: "Anexos da mensagem" })).toBeNull();
  });
});

describe("ChatPanel live confidence (follow-up #42)", () => {
  it("shows the low-confidence badge while the answer is still streaming", async () => {
    const { user, transport, field } = setup();
    await user.type(field(), "Qual é o prazo?{Enter}");
    const stream = await firstStream(transport);
    act(() => {
      stream.emit(
        { type: "start", messageId: "a-1" },
        {
          type: "tool-input-available",
          toolCallId: "c-1",
          toolName: "agent-knowledge",
          input: { prompt: "Qual é o prazo?" },
        },
        {
          type: "tool-output-available",
          toolCallId: "c-1",
          output: { text: "Talvez 30 dias.", subAgentToolResults: [] },
        },
        { type: "message-metadata", messageMetadata: { confidence: "low" } },
        { type: "text-start", id: "t-1" },
        { type: "text-delta", id: "t-1", delta: "Talvez 30 dias." },
      );
    });
    expect(await screen.findByText("Sem certeza")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Parar resposta" })).toBeTruthy();
    act(() => {
      stream.emit({ type: "text-end", id: "t-1" }, { type: "finish" });
      stream.close();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar mensagem" })).toBeTruthy());
    expect(screen.getByText("Sem certeza")).toBeTruthy();
  });

  it("refuses stream metadata outside the contract instead of showing it", async () => {
    const { user, transport, field } = setup();
    await user.type(field(), "oi{Enter}");
    const stream = await firstStream(transport);
    act(() => {
      stream.emit(
        { type: "start", messageId: "a-1" },
        { type: "message-metadata", messageMetadata: { confidence: "grounded" } },
      );
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Sem certeza")).toBeNull();
  });
});

describe("ChatPanel history scroll", () => {
  const conversation = { ...(ConversationContract.meta.examples[0] as object), id: CONVERSATION_ID };
  const stored: UIMessage[] = [{ id: "u-0", role: "user", parts: [{ type: "text", text: "Qual é o prazo?" }] }];
  const older: UIMessage[] = [{ id: "u-old", role: "user", parts: [{ type: "text", text: "Mensagem antiga" }] }];

  it("keeps the reader at the same message when earlier messages are prepended", async () => {
    const api = createFakeApi({ [`GET /v1/conversations/${CONVERSATION_ID}`]: ok(conversation) });
    api.route(`GET /v1/conversations/${CONVERSATION_ID}/messages`, ({ query }) =>
      query.get("cursor") === "1" ? page(older) : page(stored, { cursor: "1" }),
    );
    const { user } = setup({ conversationId: CONVERSATION_ID }, api);
    const button = await screen.findByRole("button", { name: "Carregar mensagens anteriores" });
    const log = screen.getByRole("log", { name: "Conversa com o assistente" });
    // jsdom has no layout: the log is 1000 px tall before the page arrives and 1600 px after.
    let height = 1000;
    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      get: () => (screen.queryByText("Mensagem antiga") === null ? height : 1600),
    });
    log.scrollTop = 40;
    height = 1000;
    await user.click(button);
    expect(await screen.findByText("Mensagem antiga")).toBeTruthy();
    expect(log.scrollTop).toBe(640);
    // The button is gone with the last page: the focus moved to the log, not to the body.
    expect(document.activeElement).toBe(log);
  });
});
