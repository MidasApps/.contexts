import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { CopyField } from "./CopyField.tsx";

describe("CopyField", () => {
  it("copies the value and announces it politely", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { user, container } = renderWithProviders(
      <CopyField label="Link do convite" value="https://example.invalid/invite#token=abc" writeText={writeText} />,
    );
    expect(screen.getByRole("textbox", { name: "Link do convite" }).getAttribute("readonly")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith("https://example.invalid/invite#token=abc");
    expect(screen.getByRole("status").textContent).toBe("Copiado para a área de transferência.");
    await expectNoAxeViolations(container);
  });

  it("masks a sensitive value until revealed and still copies the real value", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { user, container } = renderWithProviders(
      <CopyField
        label="Chave de API"
        value="sk_live_123"
        sensitive
        description="Mostrada uma única vez."
        writeText={writeText}
      />,
    );
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Chave de API" });
    expect(field.value).not.toContain("sk_live_123");
    expect(field.getAttribute("aria-describedby")).toBe(screen.getByText("Mostrada uma única vez.").id);
    const reveal = screen.getByRole("button", { name: "Mostrar valor" });
    expect(reveal.getAttribute("aria-pressed")).toBe("false");
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith("sk_live_123");
    await user.click(reveal);
    expect(field.value).toBe("sk_live_123");
    expect(screen.getByRole("button", { name: "Ocultar valor" }).getAttribute("aria-pressed")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("tells the user to copy manually when the clipboard fails", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")));
    const { user } = renderWithProviders(<CopyField label="Código" value="123-456" writeText={writeText} />, {
      locale: "en-US",
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("status").textContent).toBe("Couldn't copy. Select the text and copy it manually.");
  });
});
