import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "./Button.tsx";

describe("Button", () => {
  it("is a non-submitting button that activates with Enter and Space", async () => {
    const onClick = vi.fn();
    const { user, container } = renderWithProviders(<Button onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button.getAttribute("type")).toBe("button");
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoAxeViolations(container);
  });

  it("applies token classes per variant and size", () => {
    renderWithProviders(
      <>
        <Button variant="destructive">Excluir</Button>
        <Button variant="secondary" size="sm">
          Importar
        </Button>
      </>,
    );
    const destructive = screen.getByRole("button", { name: "Excluir" });
    expect(destructive.className).toContain("bg-destructive");
    expect(destructive.className).toContain("text-destructive-foreground");
    const secondary = screen.getByRole("button", { name: "Importar" });
    expect(secondary.className).toContain("border-border");
    expect(secondary.dataset["size"]).toBe("sm");
  });

  it("blocks clicks and announces busy while pending", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <Button pending onClick={onClick}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child with the button look when asChild", async () => {
    const { container } = renderWithProviders(
      <Button asChild variant="link">
        <a href="/profile">Perfil</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Perfil" }).className).toContain("underline");
    await expectNoAxeViolations(container);
  });
});
