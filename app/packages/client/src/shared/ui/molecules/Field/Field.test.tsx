import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./Field.tsx";

const EmailField = () => {
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <Field>
      <FieldLabel>E-mail</FieldLabel>
      <FieldDescription>Usado para entrar.</FieldDescription>
      <FieldControl>
        <Input
          type="email"
          onBlur={(event) => setError(event.target.value.includes("@") ? undefined : "Formato inválido.")}
        />
      </FieldControl>
      <FieldError errors={[error]} />
    </Field>
  );
};

describe("Field", () => {
  it("labels the control and describes it with the hint", async () => {
    const { container } = renderWithProviders(<EmailField />);
    const input = screen.getByRole("textbox", { name: "E-mail" });
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("Usado para entrar.").id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("wires aria-invalid and the error message when an error shows", async () => {
    const { user, container } = renderWithProviders(<EmailField />);
    const input = screen.getByRole("textbox", { name: "E-mail" });
    await user.type(input, "invalido");
    await user.tab();
    const error = screen.getByText("Formato inválido.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(error.className).toContain("text-destructive-text");
    await expectNoAxeViolations(container);
  });

  it("collapses duplicate messages and renders nothing without errors", () => {
    const { container, rerender } = renderWithProviders(<FieldError errors={["A", "A", "B"]} />);
    expect(container.textContent).toBe("AB");
    rerender(<FieldError errors={[undefined]} />);
    expect(container.querySelector("[data-slot=field-error]")).toBeNull();
  });

  it("groups related checkboxes in a fieldset with a legend", async () => {
    const { container } = renderWithProviders(
      <FieldGroup>
        <FieldSet>
          <FieldLegend>Preferências</FieldLegend>
          <Field orientation="horizontal">
            <FieldControl>
              <Checkbox />
            </FieldControl>
            <FieldLabel>Resumo semanal</FieldLabel>
          </Field>
        </FieldSet>
      </FieldGroup>,
    );
    expect(screen.getByRole("group", { name: "Preferências" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Resumo semanal" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
