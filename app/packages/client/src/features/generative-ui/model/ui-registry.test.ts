import { CHAT_UI_COMPONENTS } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { CORE_UI_COMPONENTS } from "../ui/core-components.ts";
import { createUiRegistry, resolveGenerativeUi, UiRegistryError } from "./ui-registry.ts";

const registry = createUiRegistry(CORE_UI_COMPONENTS);

describe("ui registry", () => {
  it("has a component for every generative UI contract, with the contract's own schema", () => {
    expect([...registry.keys()].sort()).toEqual(Object.keys(CHAT_UI_COMPONENTS).sort());
    for (const [id, contract] of Object.entries(CHAT_UI_COMPONENTS)) expect(registry.get(id)?.schema).toBe(contract.schema);
  });

  it.each(Object.entries(CHAT_UI_COMPONENTS))("resolves the contract example of %s", (id, contract) => {
    const [example] = contract.meta.examples;
    expect(resolveGenerativeUi(registry, { component: id, props: example })).toMatchObject({ ok: true, props: example });
  });

  it("answers unknown-component for an id outside the registry", () => {
    expect(resolveGenerativeUi(registry, { component: "iframe", props: { src: "https://evil.test" } })).toEqual({ ok: false, reason: "unknown-component" });
  });

  it.each([
    ["missing props", { component: "picker", props: undefined }],
    ["wrong type", { component: "picker", props: { options: "north", multiple: false } }],
    ["extra key", { component: "picker", props: { options: [{ value: "a", label: "A" }], multiple: false, onClick: "alert(1)" } }],
    ["too many rows", { component: "data-table", props: { columns: [{ key: "a", type: "text" }], rows: Array.from({ length: 501 }, () => ({ a: 1 })), truncated: true } }],
  ])("answers invalid-props for %s", (_name, ui) => {
    expect(resolveGenerativeUi(registry, ui)).toEqual({ ok: false, reason: "invalid-props" });
  });

  it("adds module components and refuses to replace a core one", () => {
    const entry = registry.get("picker");
    if (entry === undefined) throw new Error("picker missing");
    expect(createUiRegistry(CORE_UI_COMPONENTS, { "example-card": entry }).has("example-card")).toBe(true);
    expect(() => createUiRegistry(CORE_UI_COMPONENTS, { picker: entry })).toThrow(UiRegistryError);
  });
});
