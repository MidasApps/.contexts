import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Input } from "./Input.tsx";

describe("Input", () => {
  it("is labelled, typeable and uses the text-control tokens", async () => {
    const { user, container } = renderWithProviders(
      <>
        <Label htmlFor="name">Nome</Label>
        <Input id="name" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Nome" });
    await user.type(input, "Ada");
    expect((input as HTMLInputElement).value).toBe("Ada");
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("focus-visible:border-ring");
    await expectNoAxeViolations(container);
  });

  it("styles the invalid state through aria-invalid", () => {
    renderWithProviders(<Input aria-label="E-mail" aria-invalid />);
    expect(screen.getByRole("textbox", { name: "E-mail" }).className).toContain("aria-invalid:border-destructive");
  });
});
