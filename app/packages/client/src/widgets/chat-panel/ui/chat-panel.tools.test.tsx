import { act, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { parseUiSubmission } from "#/entities/message/index.ts";
import { CreateTestNoteContract, NOTE_FORM_UI, TEST_NOTE_MESSAGES } from "#/features/generative-ui/testing/note-contract.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport, type FakeChatTransport, type FakeStream } from "../testing/fake-chat-transport.ts";
import { ChatPanel } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization };
const APPROVAL_ID = "run-1::call-1";

const setup = () => {
  const transport = createFakeChatTransport();
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel scope={SCOPE} transport={transport} contracts={[CreateTestNoteContract]} />
    </TooltipProvider>,
    { extraMessages: TEST_NOTE_MESSAGES },
  );
  return { ...view, transport, field: () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" }) };
};

const streamAt = async (transport: FakeChatTransport, index: number): Promise<FakeStream> => {
  await waitFor(() => expect(transport.streams.length).toBeGreaterThan(index));
  const stream = transport.streams[index];
  if (stream === undefined) throw new Error("stream not opened");
  return stream;
};

/** The stream of a delegated command that stops for approval (spike report, SP4 Task 1 item d). */
const APPROVAL_REQUEST: UIMessageChunk[] = [
  { type: "start", messageId: "a-1" },
  { type: "tool-input-start", toolCallId: "call-1", toolName: "agent-action" },
  { type: "tool-input-available", toolCallId: "call-1", toolName: "agent-action", input: { prompt: 'confirm project named "Launch"' } },
  { type: "tool-approval-request", approvalId: APPROVAL_ID, toolCallId: "call-1" },
  { type: "data-tool-call-approval", id: "call-1", data: { runId: "run-1", toolCallId: "call-1", toolName: "command_tenancy_CreateProjectInput", args: { name: "Launch" } } },
  {
    type: "data-tool-preview",
    id: "call-1",
    data: { toolCallId: "call-1", toolName: "command_tenancy_CreateProjectInput", toolId: "command.tenancy.CreateProjectInput", permission: "core.project.create", summary: "Criar projeto Launch", preview: { before: null, after: { name: "Launch" } } },
  },
];

const approvalPartOf = (stream: FakeStream): unknown => (stream.messages.at(-1) as UIMessage).parts.find((part) => part.type === "tool-agent-action");

const askForProject = async (context: ReturnType<typeof setup>): Promise<void> => {
  await context.user.type(context.field(), "Crie o projeto Launch{Enter}");
  const stream = await streamAt(context.transport, 0);
  act(() => {
    stream.emit(...APPROVAL_REQUEST);
    stream.close();
  });
  await screen.findByRole("region", { name: "Aprovação: Criar projeto Launch" });
};

describe("ChatPanel — approvals and generative UI", () => {
  it("asks for approval inline with the before/after, then runs the command once approved", async () => {
    const context = setup();
    await askForProject(context);
    const card = screen.getByRole("region", { name: "Aprovação: Criar projeto Launch" });
    const diff = within(card).getByRole("table", { name: "Alterações propostas" });
    expect(within(diff).getByRole("row", { name: /name/ }).textContent).toContain("Launch");
    expect(within(card).getByText("Criar projetos")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delegado para Agente de ações/ })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => node.textContent === "Aguardando sua aprovação.")).toBe(true));
    expect(screen.queryByRole("button", { name: "Gerar novamente" })).toBeNull();
    await expectNoAxeViolations(context.container);

    await context.user.click(within(card).getByRole("button", { name: "Aprovar" }));
    const continuation = await streamAt(context.transport, 1);
    expect(continuation.trigger).toBe("submit-message");
    expect(approvalPartOf(continuation)).toMatchObject({ toolCallId: "call-1", state: "approval-responded", approval: { id: APPROVAL_ID, approved: true } });
    expect(await within(card).findByText("Aprovado. Executando…")).toBeTruthy();

    act(() => {
      continuation.emit(
        { type: "start", messageId: "a-1" },
        { type: "tool-output-available", toolCallId: "call-1", output: { text: "Projeto criado." } },
        { type: "text-start", id: "t-1" },
        { type: "text-delta", id: "t-1", delta: "Projeto Launch criado." },
        { type: "text-end", id: "t-1" },
        { type: "finish" },
      );
      continuation.close();
    });
    expect(await within(card).findByText("Aprovado e executado.")).toBeTruthy();
    expect(screen.getByText("Projeto Launch criado.")).toBeTruthy();
    expect(context.transport.streams).toHaveLength(2);
    await expectNoAxeViolations(context.container);
  });

  it("declines with a reason and sends it with the approval response", async () => {
    const context = setup();
    await askForProject(context);
    const card = screen.getByRole("region", { name: "Aprovação: Criar projeto Launch" });
    await context.user.click(within(card).getByRole("button", { name: "Recusar" }));
    await context.user.type(within(card).getByRole("textbox", { name: "Motivo da recusa (opcional)" }), "Nome errado");
    await context.user.click(within(card).getByRole("button", { name: "Confirmar recusa" }));
    const continuation = await streamAt(context.transport, 1);
    expect(approvalPartOf(continuation)).toMatchObject({ state: "approval-responded", approval: { id: APPROVAL_ID, approved: false, reason: "Nome errado" } });
    expect(await within(card).findByText("Recusado: Nome errado")).toBeTruthy();
    act(() => {
      continuation.emit({ type: "start", messageId: "a-1" }, { type: "tool-output-denied", toolCallId: "call-1" }, { type: "finish" });
      continuation.close();
    });
    await waitFor(() => expect(within(card).getByText("Recusado: Nome errado")).toBeTruthy());
  });

  it("renders the form a subagent asked for and sends the submitted values as the next turn", async () => {
    const context = setup();
    await context.user.type(context.field(), "Quero criar uma nota{Enter}");
    const stream = await streamAt(context.transport, 0);
    act(() => {
      stream.emit(
        { type: "start", messageId: "a-1" },
        { type: "tool-input-available", toolCallId: "call-1", toolName: "agent-data", input: { prompt: "create a note" } },
        { type: "tool-output-available", toolCallId: "call-1", output: { text: "Form shown.", subAgentToolResults: [{ toolName: "catalog_renderForm", toolCallId: "sub-1", args: {}, result: { ui: NOTE_FORM_UI } }] } },
        { type: "finish" },
      );
      stream.close();
    });
    const form = await screen.findByRole("form", { name: "Formulário: testnotes.CreateNoteCommand" });
    expect(screen.getByRole("button", { name: /Delegado para Agente de dados/ })).toBeTruthy();
    await context.user.click(within(form).getByRole("button", { name: "Enviar" }));

    const next = await streamAt(context.transport, 1);
    const sent = next.messages.at(-1) as UIMessage;
    expect(sent.role).toBe("user");
    const text = sent.parts[0]?.type === "text" ? sent.parts[0].text : "";
    expect(parseUiSubmission(text)).toEqual({ kind: "schema-form", commandId: "testnotes.CreateNoteCommand", contractId: "testnotes.Note", mode: "create", values: { title: "Kickoff" } });
    expect(await screen.findByText("Formulário enviado: testnotes.CreateNoteCommand")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Formulário: testnotes.CreateNoteCommand" })).toBeNull();
  });

  it("keeps the generic tool view for a component it does not know and for a pending four-eyes approval shows the inbox card", async () => {
    const context = setup();
    await context.user.type(context.field(), "oi{Enter}");
    const stream = await streamAt(context.transport, 0);
    act(() => {
      stream.emit(
        { type: "start", messageId: "a-1" },
        { type: "tool-input-available", toolCallId: "call-1", toolName: "module_fancyWidget", input: {} },
        { type: "tool-output-available", toolCallId: "call-1", output: { ui: { component: "fancy-widget", props: { html: "<script>1</script>" } } } },
        { type: "tool-input-available", toolCallId: "call-2", toolName: "command_example_ArchiveNoteCommand", input: { noteId: "n-1" } },
        { type: "tool-output-available", toolCallId: "call-2", output: { status: "pending-approval", approvalId: "Ap3rQ9vLr3TnB7pWc1aZ" } },
        { type: "finish" },
      );
      stream.close();
    });
    expect(await screen.findByRole("button", { name: /Ferramenta: module_fancyWidget/ })).toBeTruthy();
    expect(context.container.querySelector("script")).toBeNull();
    const pending = await screen.findByRole("region", { name: "Aguardando aprovação de outra pessoa" });
    expect(within(pending).getByRole("link", { name: "Abrir aprovações" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/approvals/Ap3rQ9vLr3TnB7pWc1aZ`);
    await expectNoAxeViolations(context.container);
  });
});
