import { describe, expect, it } from "vitest";
import { CHAT_UI_COMPONENTS } from "./chat-ui-components.ts";
import { DataTablePropsSchema, MAX_TABLE_ROWS } from "./data-table.schema.ts";

const entries = Object.entries(CHAT_UI_COMPONENTS);

describe("chat ui component contracts", () => {
  it("covers the spec §5.2 components", () => {
    expect(Object.keys(CHAT_UI_COMPONENTS).sort()).toEqual([
      "approval-diff",
      "approval-pending",
      "chart",
      "data-table",
      "picker",
      "schema-form",
    ]);
  });

  it.each(entries)("%s: is a ui-component whose examples parse", (_id, contract) => {
    expect(contract.meta.kind).toBe("ui-component");
    for (const example of contract.meta.examples) expect(contract.schema.safeParse(example).success).toBe(true);
  });

  it.each(entries)("%s: rejects unknown props", (_id, contract) => {
    const [example] = contract.meta.examples;
    expect(contract.schema.safeParse({ ...(example as object), onClick: "alert(1)" }).success).toBe(false);
  });

  it("caps table rows", () => {
    const rows = Array.from({ length: MAX_TABLE_ROWS + 1 }, () => ({ a: 1 }));
    expect(
      DataTablePropsSchema.safeParse({ columns: [{ key: "a", type: "number" }], rows, truncated: true }).success,
    ).toBe(false);
  });
});
