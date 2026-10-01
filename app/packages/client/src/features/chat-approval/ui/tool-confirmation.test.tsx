import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ToolPartView, ToolPreviewView } from "#/entities/message/index.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import type { ToolState } from "#/shared/ui/ai/tool.tsx";
import { ToolConfirmation, type ToolConfirmationProps } from "./tool-confirmation.tsx";

const APPROVAL_ID = "run-1::call-1";

const tool = (state: ToolState, approval: Partial<NonNullable<ToolPartView["approval"]>> = {}): ToolPartView => ({
  type: "tool-agent-action",
  toolName: "agent-action",
  toolCallId: "call-1",
  state,
  input: { prompt: "create project Launch" },
  output: undefined,
  errorText: undefined,
  approval: { id: APPROVAL_ID, ...approval },
});

const preview: ToolPreviewView = {
  toolCallId: "call-1",
  toolName: "command_tenancy_CreateProjectInput",
  toolId: "command.tenancy.CreateProjectInput",
  permission: "core.project.create",
  summary: "Criar projeto Launch",
  preview: { before: null, after: { name: "Launch" } },
};

const request = { toolCallId: "call-1", toolName: "command_tenancy_CreateProjectInput", args: { name: "Launch" } };

const setup = (props: Partial<ToolConfirmationProps> = {}) => {
  const onRespond = vi.fn();
  const tree = (extra: Partial<ToolConfirmationProps> = {}): ReactElement => (
    <ToolConfirmation tool={tool("approval-requested")} preview={preview} request={request} onRespond={onRespond} interactive diff={<p>diff da alteração</p>} {...props} {...extra} />
  );
  return { ...renderWithProviders(tree()), onRespond, tree };
};

describe("ToolConfirmation", () => {
  it("says what will run, under which permission and with which data", async () => {
    const { container } = setup();
    const card = screen.getByRole("region", { name: "Aprovação: Criar projeto Launch" });
    expect(within(card).getByRole("heading", { name: "Aprovação necessária" })).toBeTruthy();
    expect(within(card).getByText("Criar projeto Launch")).toBeTruthy();
    expect(within(card).getByText("core.project.create")).toBeTruthy();
    expect(within(card).getByText("diff da alteração")).toBeTruthy();
    expect(within(card).getByRole("region", { name: "Dados enviados" }).textContent).toContain('"name": "Launch"');
    await expectNoAxeViolations(container);
  });

  it("approves with the approval id of the part, once", async () => {
    const { user, onRespond } = setup();
    const approve = screen.getByRole("button", { name: "Aprovar" });
    await user.dblClick(approve);
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({ id: APPROVAL_ID, approved: true });
    expect(screen.getByRole("button", { name: "Aprovando…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Recusar" })).toHaveProperty("disabled", true);
  });

  it("declines in two steps with an optional reason that is trimmed", async () => {
    const { user, onRespond, container } = setup();
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    expect(onRespond).not.toHaveBeenCalled();
    const reason = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Motivo da recusa (opcional)" });
    expect(document.activeElement).toBe(reason);
    expect(reason.getAttribute("maxlength")).toBe("500");
    await expectNoAxeViolations(container);
    await user.type(reason, "  Nome errado  ");
    await user.click(screen.getByRole("button", { name: "Confirmar recusa" }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({ id: APPROVAL_ID, approved: false, reason: "Nome errado" });
  });

  it("declines without a reason and lets the member go back before confirming", async () => {
    const { user, onRespond } = setup();
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar recusa" }));
    expect(onRespond).toHaveBeenCalledExactlyOnceWith({ id: APPROVAL_ID, approved: false });
  });

  it("falls back to the tool name without a preview and says there is nothing to compare", () => {
    setup({ preview: undefined, request: undefined, diff: undefined });
    expect(screen.getByRole("region", { name: "Aprovação: Executar agent-action" })).toBeTruthy();
    expect(screen.getByText("Sem prévia das alterações.")).toBeTruthy();
  });

  it("cannot be answered from an older turn or while an answer streams", () => {
    setup({ interactive: false });
    expect(screen.getByRole("button", { name: "Aprovar" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Recusar" })).toHaveProperty("disabled", true);
  });

  it.each<[string, ToolPartView, string]>([
    ["approved, running", tool("approval-responded", { approved: true }), "Aprovado. Executando…"],
    ["approved and executed", tool("output-available", { approved: true }), "Aprovado e executado."],
    ["approved but failed", tool("output-error", { approved: true }), "Aprovado, mas a execução falhou."],
    ["declined", tool("approval-responded", { approved: false }), "Recusado."],
    ["declined with a reason", tool("output-denied", { approved: false, reason: "Nome errado" }), "Recusado: Nome errado"],
  ])("shows the result when %s, without the buttons", async (_name, part, text) => {
    const { container } = setup({ tool: part });
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Criar projeto Launch" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("moves the focus to the result after the member decided", async () => {
    const { user, rerender, tree } = setup();
    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    rerender(tree({ tool: tool("approval-responded", { approved: true }) }));
    expect(document.activeElement?.textContent).toBe("Aprovado. Executando…");
  });

  it("renders nothing for a tool part without an approval", () => {
    const { container } = setup({ tool: { ...tool("output-available"), approval: undefined } });
    expect(container.querySelector("[data-slot=confirmation]")).toBeNull();
  });
});
