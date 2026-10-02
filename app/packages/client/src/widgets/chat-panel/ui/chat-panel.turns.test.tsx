import { ConversationContract } from "@core/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { formatUiSubmission } from "#/entities/message/index.ts";
import {
  CreateTestNoteContract,
  NOTE_FORM_UI,
  TEST_NOTE_MESSAGES,
} from "#/features/generative-ui/testing/note-contract.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createFakeApi, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport, type FakeChatTransport, type FakeStream } from "../testing/fake-chat-transport.ts";
import { ChatPanel } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization };
const CONVERSATION_ID = "Cv8sK2lPq0WnR5tYu3bV";
const APPROVAL_ID = "run-1::call-1";
const WAIT_FOR_APPROVAL = "Aprove ou recuse a ação acima antes de continuar.";

const setup = (stored?: UIMessage[]) => {
  const transport = createFakeChatTransport();
  const api = createFakeApi(
    stored === undefined
      ? {}
      : {
          [`GET /v1/conversations/${CONVERSATION_ID}`]: ok({
            ...(ConversationContract.meta.examples[0] as object),
            id: CONVERSATION_ID,
          }),
          [`GET /v1/conversations/${CONVERSATION_ID}/messages`]: page(stored),
        },
  );
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel
        scope={SCOPE}
        transport={transport}
        contracts={[CreateTestNoteContract]}
        {...(stored === undefined ? {} : { conversationId: CONVERSATION_ID })}
      />
    </TooltipProvider>,
    { api, extraMessages: TEST_NOTE_MESSAGES },
  );
  return { ...view, transport, field: () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" }) };
};

const streamAt = async (transport: FakeChatTransport, index: number): Promise<FakeStream> => {
  await waitFor(() => expect(transport.streams.length).toBeGreaterThan(index));
  const stream = transport.streams[index];
  if (stream === undefined) throw new Error("stream not opened");
  return stream;
};

const APPROVAL_REQUEST: UIMessageChunk[] = [
  { type: "start", messageId: "a-1" },
  {
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "agent-action",
    input: { prompt: 'confirm project named "Launch"' },
  },
  { type: "tool-approval-request", approvalId: APPROVAL_ID, toolCallId: "call-1" },
  {
    type: "data-tool-preview",
    id: "call-1",
    data: {
      toolCallId: "call-1",
      toolName: "command_tenancy_CreateProjectInput",
      toolId: "command.tenancy.CreateProjectInput",
      permission: "core.project.create",
      summary: "Criar projeto Launch",
      preview: { before: null, after: { name: "Launch" } },
    },
  },
];

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const answer = (id: string, text: string): UIMessage => ({ id, role: "assistant", parts: [{ type: "text", text }] });
const toolAnswer = (id: string, part: Record<string, unknown>): UIMessage => ({
  id,
  role: "assistant",
  parts: [part as UIMessage["parts"][number]],
});

const PICKER_UI = {
  component: "picker",
  props: {
    multiple: false,
    options: [
      { value: "small", label: "Pequeno" },
      { value: "large", label: "Grande" },
    ],
  },
};
const pickerAnswer = (id: string) =>
  toolAnswer(id, {
    type: "tool-catalog_pick",
    toolCallId: "call-p",
    state: "output-available",
    input: {},
    output: { ui: PICKER_UI },
  });
const formAnswer = (id: string) =>
  toolAnswer(id, {
    type: "tool-catalog_renderForm",
    toolCallId: "call-f",
    state: "output-available",
    input: {},
    output: { ui: NOTE_FORM_UI },
  });

describe("ChatPanel — a turn waiting for the member", () => {
  it("holds the next message while an approval waits, and says why", async () => {
    const context = setup();
    await context.user.type(context.field(), "Crie o projeto Launch{Enter}");
    const stream = await streamAt(context.transport, 0);
    act(() => {
      stream.emit(...APPROVAL_REQUEST);
      stream.close();
    });
    await screen.findByRole("region", { name: "Aprovação: Criar projeto Launch" });
    await context.user.type(context.field(), "Na verdade, outra coisa");
    expect(await screen.findByText(WAIT_FOR_APPROVAL)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar mensagem" }).hasAttribute("disabled")).toBe(true);
    await context.user.keyboard("{Enter}");
    expect(context.transport.streams).toHaveLength(1);
    // The draft is kept for after the decision.
    expect(context.field().value).toBe("Na verdade, outra coisa");
    await expectNoAxeViolations(context.container);

    await context.user.click(screen.getByRole("button", { name: "Aprovar" }));
    const continuation = await streamAt(context.transport, 1);
    act(() => {
      continuation.emit(
        { type: "start", messageId: "a-1" },
        { type: "tool-output-available", toolCallId: "call-1", output: { text: "ok" } },
        { type: "finish" },
      );
      continuation.close();
    });
    await waitFor(() => expect(screen.queryByText(WAIT_FOR_APPROVAL)).toBeNull());
  });

  it("says an approval the conversation moved past is no longer active, instead of bare disabled buttons", async () => {
    setup([
      user("u-1", "Crie o projeto Launch"),
      toolAnswer("a-1", {
        type: "tool-agent-action",
        toolCallId: "call-1",
        state: "approval-requested",
        input: { prompt: "create" },
        approval: { id: APPROVAL_ID },
      }),
      user("u-2", "Deixa pra lá"),
      answer("a-2", "Tudo bem."),
    ]);
    const card = await screen.findByRole("region", { name: /^Aprovação:/ });
    expect(within(card).getByText("Esta aprovação não está mais ativa. A ação não foi executada.")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Recusar" })).toBeNull();
    expect(screen.queryByText(WAIT_FOR_APPROVAL)).toBeNull();
  });
});

describe("ChatPanel — generative UI of older turns", () => {
  it("shows the choice a picker got in the next turn", async () => {
    const choice = formatUiSubmission({ kind: "picker", values: ["large"], labels: ["Grande"] });
    setup([user("u-1", "Qual tamanho?"), pickerAnswer("a-1"), user("u-2", choice), answer("a-2", "Grande, então.")]);
    const picker = await screen.findByRole("group", { name: "Escolha uma opção" });
    expect(within(picker).getByRole("radio", { name: "Grande" }).getAttribute("aria-checked")).toBe("true");
    expect(within(picker).getByRole("radio", { name: "Pequeno" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Escolha enviada.")).toBeTruthy();
  });

  it("says a picker nobody answered is no longer active", async () => {
    setup([user("u-1", "Qual tamanho?"), pickerAnswer("a-1"), user("u-2", "Esquece"), answer("a-2", "Ok.")]);
    expect(await screen.findByText("Esta escolha não está mais ativa.")).toBeTruthy();
    expect(screen.queryByText("Escolha enviada.")).toBeNull();
  });

  it("says a form of an older turn was sent, or is no longer active, instead of an empty card", async () => {
    const submitted = formatUiSubmission({
      kind: "schema-form",
      commandId: "testnotes.CreateNoteCommand",
      contractId: "testnotes.Note",
      mode: "create",
      values: { title: "Kickoff" },
    });
    setup([
      user("u-1", "Nota"),
      formAnswer("a-1"),
      user("u-2", submitted),
      answer("a-2", "Criada."),
      user("u-3", "Outra"),
      formAnswer("a-3"),
      user("u-4", "Esquece"),
      answer("a-4", "Ok."),
    ]);
    const forms = await screen.findAllByRole("region", { name: "Formulário: testnotes.CreateNoteCommand" });
    expect(forms).toHaveLength(2);
    expect(within(forms[0] as HTMLElement).getByText("Formulário enviado.")).toBeTruthy();
    expect(within(forms[1] as HTMLElement).getByText("Este formulário não está mais ativo.")).toBeTruthy();
  });
});
