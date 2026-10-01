import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentSection,
  Attachment,
  AttachmentRemove,
  Attachments,
  AudioPlayer,
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  CodeBlock,
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
  Context,
  Conversation,
  ConversationEmptyState,
  InlineCitation,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  Plan,
  PlanContent,
  PlanHeader,
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Queue,
  QueueItem,
  Reasoning,
  Shimmer,
  Source,
  Sources,
  SpeechInput,
  Suggestion,
  Suggestions,
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "./index.ts";

const noop = (): void => undefined;

describe("AI Elements (ported)", () => {
  it("renders a conversation with messages, tools and sources without axe violations", async () => {
    const { container } = renderWithProviders(
      <TooltipProvider>
        <Conversation label="Conversa com o assistente">
          <Message from="user" author="Você">
            <MessageContent>Qual é o prazo?</MessageContent>
          </Message>
          <Message from="assistant" author="Assistente">
            <MessageContent>
              <Reasoning text="Preciso consultar a base." />
              <Agent>
                <AgentHeader name="Agente de conhecimento" />
                <AgentContent>
                  <AgentSection title="Pedido">Qual é o prazo?</AgentSection>
                </AgentContent>
              </Agent>
              <Tool>
                <ToolHeader title="knowledge_searchKnowledge" state="output-available" />
                <ToolContent>
                  <ToolInput value={{ query: "prazo" }} />
                  <ToolOutput value={{ results: [] }} />
                </ToolContent>
              </Tool>
              <Task>
                <TaskTrigger title="2 etapas" />
                <TaskContent>
                  <TaskItem>Busca</TaskItem>
                </TaskContent>
              </Task>
              <MessageResponse>{"O prazo é **30 dias**."}</MessageResponse>
              <InlineCitation index={1} title="Guia">
                Trecho citado.
              </InlineCitation>
              <Sources count={1}>
                <Source index={1} title="Guia" href="https://docs.example.com/guia" snippet="Trecho." />
              </Sources>
            </MessageContent>
            <MessageActions>
              <MessageAction label="Copiar resposta" onClick={noop}>
                c
              </MessageAction>
            </MessageActions>
          </Message>
        </Conversation>
      </TooltipProvider>,
    );
    expect(screen.getByRole("log", { name: "Conversa com o assistente" }).getAttribute("aria-live")).toBe("off");
    expect(screen.getByRole("article", { name: "Você" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("keeps reasoning and tool details collapsed until asked", async () => {
    const { user } = renderWithProviders(
      <>
        <Reasoning text="Passo secreto do raciocínio." />
        <Tool>
          <ToolHeader title="catalog_listEntities" state="input-available" />
          <ToolContent>
            <ToolInput value={{ a: 1 }} />
          </ToolContent>
        </Tool>
      </>,
    );
    expect(screen.queryByText("Passo secreto do raciocínio.")).toBeNull();
    const reasoning = screen.getByRole("button", { name: /Raciocínio/ });
    expect(reasoning.getAttribute("aria-expanded")).toBe("false");
    await user.click(reasoning);
    expect(screen.getByText("Passo secreto do raciocínio.")).toBeTruthy();
    const tool = screen.getByRole("button", { name: /catalog_listEntities/ });
    expect(within(tool).getByText("Executando")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Entrada" })).toBeNull();
    await user.click(tool);
    expect(screen.getByRole("region", { name: "Entrada" }).textContent).toContain('"a": 1');
  });

  it.each<[ToolState, string]>([
    ["input-streaming", "Preparando"],
    ["approval-requested", "Aguardando aprovação"],
    ["output-available", "Concluído"],
    ["output-error", "Falhou"],
    ["output-denied", "Recusado"],
  ])("names the tool state %s in words", (state, label) => {
    renderWithProviders(
      <Tool>
        <ToolHeader title="t" state={state} />
      </Tool>,
    );
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("submits the prompt on Enter, not on Shift+Enter, and stops on Esc or the stop button", async () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const { user, rerender } = renderWithProviders(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea label="Mensagem" onEscape={onStop} />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status="ready" onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>,
    );
    const input = screen.getByRole("textbox", { name: "Mensagem" });
    await user.type(input, "linha 1{Shift>}{Enter}{/Shift}linha 2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toBe("linha 1\nlinha 2");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
    rerender(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea label="Mensagem" onEscape={onStop} />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status="streaming" onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>,
    );
    await user.click(screen.getByRole("button", { name: "Parar resposta" }));
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows the confirmation parts of the current state only", () => {
    const tree = (state: ToolState, approved?: boolean) => (
      <Confirmation state={state} approval={{ id: "run::call", approved }} label="Aprovação: criar projeto">
        <ConfirmationTitle>Criar projeto</ConfirmationTitle>
        <ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction>Aprovar</ConfirmationAction>
          </ConfirmationActions>
        </ConfirmationRequest>
        <ConfirmationAccepted>aceito</ConfirmationAccepted>
        <ConfirmationRejected>recusado</ConfirmationRejected>
      </Confirmation>
    );
    const { rerender, container } = renderWithProviders(tree("approval-requested"));
    expect(screen.getByRole("region", { name: "Aprovação: criar projeto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeTruthy();
    expect(screen.queryByText("aceito")).toBeNull();
    rerender(tree("approval-responded", true));
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(screen.getByText("aceito")).toBeTruthy();
    rerender(tree("output-denied", false));
    expect(screen.getByText("recusado")).toBeTruthy();
    rerender(tree("input-available"));
    expect(container.querySelector("[data-slot=confirmation]")).toBeNull();
  });

  it("drops an unsafe source link and keeps the title", () => {
    renderWithProviders(
      <Sources count={1} defaultOpen>
        <Source index={1} title="Fonte estranha" href="javascript:alert(1)" />
      </Sources>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Fonte estranha")).toBeTruthy();
  });

  it("sends the prompt of a suggestion", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(
      <Suggestions label="Sugestões">
        <Suggestion title="Consultar dados" description="Entidades" prompt="Quais dados?" onSelect={onSelect} />
      </Suggestions>,
    );
    await user.click(within(screen.getByRole("list", { name: "Sugestões" })).getByRole("button", { name: /Consultar dados/ }));
    expect(onSelect).toHaveBeenCalledWith("Quais dados?");
  });

  it("renders the remaining components without axe violations", async () => {
    const { container } = renderWithProviders(
      <div>
        <ConversationEmptyState title="Como posso ajudar?" description="Pergunte." />
        <Plan defaultOpen>
          <PlanHeader title="Plano" description="3 etapas" />
          <PlanContent>
            <Queue>
              <QueueItem status="done" statusLabel="concluída">
                Ler
              </QueueItem>
              <QueueItem status="running" statusLabel="em andamento">
                Resumir
              </QueueItem>
            </Queue>
          </PlanContent>
        </Plan>
        <ChainOfThought defaultOpen>
          <ChainOfThoughtHeader>Etapas</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            <ChainOfThoughtStep title="Buscar" status="active" />
          </ChainOfThoughtContent>
        </ChainOfThought>
        <Context usage={{ inputTokens: 1000, outputTokens: 500 }} maxTokens={6000} />
        <Attachments label="Anexos">
          <Attachment name="diagrama.png" mediaType="image/png" detail="48 KB" action={<AttachmentRemove label="Remover diagrama.png" />} />
        </Attachments>
        <SpeechInput recording label="Segurar para falar" />
        <AudioPlayer label="Resposta em áudio" src="data:audio/mpeg;base64," />
        <CodeBlock code="const a = 1;" language="ts" label="Código" />
        <Shimmer>Respondendo…</Shimmer>
      </div>,
    );
    expect(screen.getByRole("button", { name: "Contexto usado: 25%" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Segurar para falar" }).getAttribute("aria-pressed")).toBe("true");
    await expectNoAxeViolations(container);
  });
});
