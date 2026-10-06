import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Field, FieldControl, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { PasswordInput } from "./PasswordInput.tsx";

describe("PasswordInput", () => {
  it("is labelled through the field and toggles visibility with a pressed button", async () => {
    const { user, container } = renderWithProviders(
      <Field>
        <FieldLabel>Senha</FieldLabel>
        <FieldControl>
          <PasswordInput defaultValue="segredo" />
        </FieldControl>
      </Field>,
    );
    const input = screen.getByLabelText("Senha");
    expect(input.getAttribute("type")).toBe("password");
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    await user.click(toggle);
    expect(input.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await expectNoAxeViolations(container);
  });
});
