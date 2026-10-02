import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ChatInput, type ChatInputProps } from "./chat-input.tsx";

const setup = (props: Partial<ChatInputProps> = {}) => {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const view = renderWithProviders(<ChatInput status="ready" onSend={onSend} onStop={onStop} {...props} />);
  return { ...view, onSend, onStop, field: () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" }) };
};

describe("ChatInput", () => {
  it("sends the trimmed text on Enter, clears the field and keeps the focus in it", async () => {
    const { user, onSend, field } = setup();
    await user.type(field(), "  Qual é o prazo?  {Enter}");
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Qual é o prazo?");
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
  });

  it("invites a question instead of repeating the send button, and keeps the keyboard hint off touch screens", () => {
    const { field } = setup();
    expect(field().getAttribute("placeholder")).toBe("Pergunte ou peça algo…");
    expect(field().getAttribute("placeholder")).not.toBe(screen.getByRole("button", { name: "Enviar mensagem" }).getAttribute("aria-label"));
    const hint = screen.getByText(/Enter envia/u);
    // Still part of the field description; only hidden visually on a coarse pointer (no keyboard).
    expect(field().getAttribute("aria-describedby")).toContain(hint.id);
    expect(hint.className).toContain("pointer-coarse:hidden");
  });

  it("breaks the line on Shift+Enter and sends nothing for blank text", async () => {
    const { user, onSend, field } = setup();
    await user.type(field(), "a{Shift>}{Enter}{/Shift}b");
    expect(field().value).toBe("a\nb");
    await user.clear(field());
    await user.type(field(), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enviar mensagem" })).toHaveProperty("disabled", true);
  });

  it("sends with the button", async () => {
    const { user, onSend, field } = setup();
    await user.type(field(), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(onSend).toHaveBeenCalledWith("oi");
  });

  it("turns send into stop while the answer streams; Esc stops too and the draft stays", async () => {
    const { user, onSend, onStop, field } = setup({ status: "streaming" });
    await user.type(field(), "próxima pergunta{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe("próxima pergunta");
    await user.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Parar resposta" }));
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it("does not stop anything on Esc when no answer is on its way", async () => {
    const { user, onStop, field } = setup();
    await user.type(field(), "oi{Escape}");
    expect(onStop).not.toHaveBeenCalled();
  });

  it("says why it cannot send over the limit and keeps the text", async () => {
    const { user, onSend, field } = setup({ maxLength: 10 });
    await user.type(field(), "123456789");
    expect(screen.getByText("9 de 10 caracteres")).toBeTruthy();
    await user.type(field(), "0123{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe("1234567890123");
    expect(screen.getByRole("status").textContent).toBe("Limite de 10 caracteres. Remova 3 caracteres.");
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  it("lets the member type offline but not send, and says so", async () => {
    const { user, onSend, field } = setup({ offline: true });
    await user.type(field(), "rascunho{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe("rascunho");
    expect(screen.getByRole("status").textContent).toContain("Sem conexão");
  });

  it("has no axe violations in each state", async () => {
    const { container, rerender } = setup({ offline: true });
    await expectNoAxeViolations(container);
    rerender(<ChatInput status="streaming" onSend={vi.fn()} onStop={vi.fn()} />);
    await expectNoAxeViolations(container);
    rerender(<ChatInput status="ready" disabled onSend={vi.fn()} onStop={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
