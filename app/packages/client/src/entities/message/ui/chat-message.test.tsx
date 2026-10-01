import { screen, within } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { formatUiSubmission } from "../lib/ui-submission.ts";
import { ChatMessage } from "./chat-message.tsx";

const KB = "kb:01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f#3";

const assistant = (parts: unknown[], metadata?: unknown): UIMessage => ({ id: "a-1", role: "assistant", metadata, parts: parts as UIMessage["parts"] });

const delegation = {
  type: "tool-agent-knowledge",
  toolCallId: "c-1",
  state: "output-available",
  input: { prompt: "Qual é o prazo de entrega?" },
  output: {
    text: "O prazo é de 30 dias.",
    subAgentToolResults: [
      {
        toolName: "knowledge_searchKnowledge",
        toolCallId: "s-1",
        args: { query: "prazo" },
        result: { results: [{ citationId: KB, documentId: "d", title: "Guia de entregas", sourceUrl: "https://docs.example.com/entregas", snippet: "Entregas em até 30 dias.", score: 0.9 }] },
      },
    ],
  },
};

describe("ChatMessage", () => {
  it("renders a member turn as plain text in an article named by its author", () => {
    renderWithProviders(<ChatMessage message={{ id: "u-1", role: "user", parts: [{ type: "text", text: "**não** é markdown\nlinha 2" }] }} />);
    const article = screen.getByRole("article", { name: "Você" });
    expect(within(article).getByText(/\*\*não\*\* é markdown/)).toBeTruthy();
  });

  it("shows a delegation as an agent card with the subagent, collapsed, and its steps on demand", async () => {
    const { user } = renderWithProviders(<ChatMessage message={assistant([delegation, { type: "text", text: "O prazo é de 30 dias." }])} />);
    const card = screen.getByRole("button", { name: /Delegado para Agente de conhecimento/ });
    expect(card.getAttribute("aria-expanded")).toBe("false");
    expect(within(card).getByText("Concluído")).toBeTruthy();
    expect(screen.queryByText("Qual é o prazo de entrega?")).toBeNull();
    await user.click(card);
    expect(screen.getByText("Qual é o prazo de entrega?")).toBeTruthy();
    expect(screen.getByText("knowledge_searchKnowledge")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 etapa" })).toBeTruthy();
  });

  it("names an unknown subagent by its id", () => {
    renderWithProviders(<ChatMessage message={assistant([{ type: "tool-agent-billing", toolCallId: "c-9", state: "input-available", input: { prompt: "x" } }])} />);
    expect(screen.getByRole("button", { name: /Delegado para Agente billing/ })).toBeTruthy();
  });

  it("keeps reasoning collapsed and hides it when the tenant turns it off", async () => {
    const message = assistant([{ type: "reasoning", text: "Vou consultar a base.", state: "done" }, { type: "text", text: "Pronto." }]);
    const { user, rerender } = renderWithProviders(<ChatMessage message={message} />);
    expect(screen.queryByText("Vou consultar a base.")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Raciocínio/ }));
    expect(screen.getByText("Vou consultar a base.")).toBeTruthy();
    rerender(<ChatMessage message={message} showReasoning={false} />);
    expect(screen.queryByRole("button", { name: /Raciocínio/ })).toBeNull();
  });

  it("renders a plain tool call collapsed with its state", () => {
    renderWithProviders(<ChatMessage message={assistant([{ type: "tool-catalog_listEntities", toolCallId: "c-2", state: "input-available", input: {} }])} />);
    const tool = screen.getByRole("button", { name: /Ferramenta catalog_listEntities/ });
    expect(tool.getAttribute("aria-expanded")).toBe("false");
    expect(within(tool).getByText("Executando")).toBeTruthy();
  });

  it("numbers citations, resolves them against the passages of the turn and lists the sources", async () => {
    const { user } = renderWithProviders(<ChatMessage message={assistant([delegation, { type: "text", text: `O prazo é de 30 dias [${KB}].` }])} />);
    expect(screen.queryByText(/kb:/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Fonte 1: Guia de entregas" }));
    expect(screen.getByText("Entregas em até 30 dias.")).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /1 fonte/ }));
    const link = screen.getByRole("link", { name: /Guia de entregas/ });
    expect(link.getAttribute("href")).toBe("https://docs.example.com/entregas");
  });

  it("shows a tripwire as an alert with the reason of its processor, and a default for unknown ones", () => {
    const { rerender } = renderWithProviders(<ChatMessage message={assistant([{ type: "data-tripwire", data: { reason: "BUDGET_EXCEEDED", metadata: { processorId: "tenant-budget-guard" } } }])} />);
    expect(screen.getByText("Resposta bloqueada")).toBeTruthy();
    expect(screen.getByText("O orçamento de IA da organização acabou. Fale com um administrador.")).toBeTruthy();
    rerender(<ChatMessage message={assistant([{ type: "data-tripwire", data: { reason: "x", processorId: "some-new-processor" } }])} />);
    expect(screen.getByText("Uma regra de segurança interrompeu esta resposta.")).toBeTruthy();
  });

  it("badges a low-confidence answer, already while it streams", () => {
    const message = assistant([{ type: "text", text: "Acho que sim." }], { confidence: "low" });
    const { rerender } = renderWithProviders(<ChatMessage message={message} streaming />);
    expect(screen.getByText("Sem certeza")).toBeTruthy();
    rerender(<ChatMessage message={message} />);
    expect(screen.getByText("Sem certeza")).toBeTruthy();
    expect(screen.getByText(/Confira antes de usar/)).toBeTruthy();
    rerender(<ChatMessage message={assistant([{ type: "text", text: "Sim." }], { confidence: "normal" })} />);
    expect(screen.queryByText("Sem certeza")).toBeNull();
  });

  it("marks an interrupted answer and keeps the partial text", () => {
    renderWithProviders(<ChatMessage message={assistant([{ type: "text", text: "O prazo é de" }])} interrupted />);
    expect(screen.getByText("O prazo é de")).toBeTruthy();
    expect(screen.getByText("Interrompido")).toBeTruthy();
  });

  it("lists the attachments of a member turn and shows a form submission as a chip", () => {
    const text = formatUiSubmission({ kind: "schema-form", commandId: "example.CreateNoteCommand", contractId: "example.Note", mode: "create", values: { title: "Kickoff" } });
    renderWithProviders(
      <ChatMessage message={{ id: "u-1", role: "user", metadata: { attachments: [{ fileId: "f-1", name: "diagrama.png", mediaType: "image/png", sizeBytes: 1 }] }, parts: [{ type: "text", text }] }} />,
    );
    expect(screen.getByText("Formulário enviado: example.CreateNoteCommand")).toBeTruthy();
    expect(screen.queryByText(/Kickoff/)).toBeNull();
    expect(within(screen.getByRole("list", { name: "Anexos" })).getByText("diagrama.png")).toBeTruthy();
  });

  it("ignores parts it does not know and lets a feature replace a tool part", () => {
    renderWithProviders(
      <ChatMessage
        message={assistant([{ type: "data-made-up", data: { a: 1 } }, { type: "step-start" }, delegation])}
        renderTool={({ tool, delegation: view }, fallback) => (
          <div>
            <span>
              slot:{tool.toolCallId}:{view?.agentId}
            </span>
            {fallback}
          </div>
        )}
      />,
    );
    expect(screen.getByText("slot:c-1:knowledge")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delegado para/ })).toBeTruthy();
  });

  it("has no axe violations with every kind of part open", async () => {
    const { container, user } = renderWithProviders(
      <ChatMessage
        message={assistant(
          [
            { type: "reasoning", text: "Pensando.", state: "done" },
            delegation,
            { type: "tool-web_search", toolCallId: "c-3", state: "output-error", input: { query: "x" }, errorText: "Tempo esgotado." },
            { type: "data-tripwire", data: { processorId: "moderation" } },
            { type: "text", text: `Resposta com fonte [${KB}].` },
          ],
          { confidence: "low" },
        )}
        interrupted
      />,
    );
    for (const button of screen.getAllByRole("button", { expanded: false })) await user.click(button);
    await expectNoAxeViolations(container);
  });
});
