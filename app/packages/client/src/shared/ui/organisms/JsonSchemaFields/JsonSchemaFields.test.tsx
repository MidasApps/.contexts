import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { JsonSchemaFields } from "./JsonSchemaFields.tsx";
import { useJsonSchemaInput } from "./use-json-schema-input.ts";

const SCHEMA = {
  type: "object",
  properties: {
    days: { type: "integer", minimum: 1, maximum: 30, default: 7 },
    dryRun: { type: "boolean", title: "Dry run" },
    mode: { type: "string", enum: ["fast", "full"] },
  },
  required: ["days", "dryRun", "mode"],
};

function Harness({ schema, onRead }: { schema: Record<string, unknown> | null; onRead: (value: Record<string, unknown> | null) => void }) {
  const input = useJsonSchemaInput(schema);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onRead(input.read());
      }}
    >
      <JsonSchemaFields plan={input.plan} draft={input.draft} onDraftChange={input.setDraft} problems={input.problems} labelOf={(field) => field.title ?? field.name} jsonHint="hint" />
      <button type="submit">send</button>
    </form>
  );
}

describe("JsonSchemaFields", () => {
  it("renders numbers, switches and enums as labelled controls and reads them back typed", async () => {
    const reads: (Record<string, unknown> | null)[] = [];
    const { user, container } = renderWithProviders(<Harness schema={SCHEMA} onRead={(value) => reads.push(value)} />);
    expect(screen.getByRole("group", { name: "Dados de entrada" })).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /days/u }).value).toBe("7");
    await user.click(screen.getByRole("button", { name: "send" }));
    expect(reads.at(-1)).toBeNull();
    expect(screen.getByText("Preencha este campo.")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("combobox", { name: /mode/u }));
    await user.click(await screen.findByRole("option", { name: "full" }));
    await user.click(screen.getByRole("switch", { name: "Dry run" }));
    await user.click(screen.getByRole("button", { name: "send" }));
    expect(reads.at(-1)).toEqual({ days: 7, dryRun: true, mode: "full" });
  });

  it("asks for nothing when the workflow declares no input", () => {
    const { container } = renderWithProviders(<Harness schema={null} onRead={() => undefined} />);
    expect(container.querySelector("fieldset")).toBeNull();
  });

  it("edits shapes a form cannot hold as JSON, with no way back to fields", async () => {
    const reads: (Record<string, unknown> | null)[] = [];
    const { user } = renderWithProviders(<Harness schema={{ type: "object", properties: { tags: { type: "array" } } }} onRead={(value) => reads.push(value)} />);
    expect(screen.queryByRole("button", { name: "Editar como formulário" })).toBeNull();
    const json = screen.getByRole("textbox", { name: "Dados de entrada (JSON)" });
    await user.click(json);
    await user.paste('{"tags":["a"]}');
    await user.click(screen.getByRole("button", { name: "send" }));
    expect(reads.at(-1)).toEqual({ tags: ["a"] });
  });
});
