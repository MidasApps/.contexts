import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Textarea } from "./Textarea.tsx";

describe("Textarea", () => {
  it("accepts multi-line text with a label", async () => {
    const { user, container } = renderWithProviders(<Textarea aria-label="Descrição" />);
    const textarea = screen.getByRole("textbox", { name: "Descrição" });
    await user.type(textarea, "linha 1{Enter}linha 2");
    expect((textarea as HTMLTextAreaElement).value).toBe("linha 1\nlinha 2");
    await expectNoAxeViolations(container);
  });
});
