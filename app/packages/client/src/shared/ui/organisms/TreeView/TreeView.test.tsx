import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { TreeView } from "./TreeView.tsx";
import { findByTypeahead, type TreeNode, visibleNodes } from "./tree-model.ts";

const NODES: TreeNode[] = [
  {
    id: "north",
    label: "Norte",
    children: [
      { id: "store-1", label: "Loja Centro" },
      { id: "store-2", label: "Loja Bairro" },
    ],
  },
  { id: "south", label: "Sul", children: [{ id: "store-3", label: "Loja Porto" }] },
  { id: "hq", label: "Matriz" },
];

const Units = ({ onSelect }: { onSelect: (id: string) => void }) => {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  return (
    <TreeView
      label="Unidades"
      nodes={NODES}
      selectedId={selected}
      onSelect={(id) => {
        setSelected(id);
        onSelect(id);
      }}
    />
  );
};

const focused = (): string | null | undefined => document.activeElement?.textContent;

describe("tree-model", () => {
  it("lists visible nodes depth-first and finds by first letter", () => {
    const visible = visibleNodes(NODES, new Set(["north"]));
    expect(visible.map((entry) => `${entry.node.id}@${entry.level}`)).toEqual([
      "north@1",
      "store-1@2",
      "store-2@2",
      "south@1",
      "hq@1",
    ]);
    expect(findByTypeahead(visible, "north", "m", "pt-BR")).toBe("hq");
    expect(findByTypeahead(visible, "hq", "n", "pt-BR")).toBe("north");
  });
});

describe("TreeView", () => {
  it("is one tab stop with the WAI-ARIA keyboard model", async () => {
    const onSelect = vi.fn();
    const { user, container } = renderWithProviders(<Units onSelect={onSelect} />);
    await user.tab();
    const north = screen.getByRole("treeitem", { name: "Norte" });
    expect(document.activeElement).toBe(north);
    expect(north.getAttribute("aria-expanded")).toBe("false");
    await user.keyboard("{ArrowRight}");
    expect(north.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowRight}");
    expect(focused()).toBe("Loja Centro");
    expect(document.activeElement?.getAttribute("aria-level")).toBe("2");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(focused()).toContain("Sul");
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(document.activeElement).toBe(north);
    await user.keyboard("{End}");
    expect(focused()).toBe("Matriz");
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(north);
    await user.keyboard("m");
    expect(focused()).toBe("Matriz");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("hq");
    expect(screen.getByRole("treeitem", { name: "Matriz" }).getAttribute("aria-selected")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("collapses an open item with ArrowLeft and names items without their children", async () => {
    const { user } = renderWithProviders(<Units onSelect={() => undefined} />);
    await user.click(screen.getByRole("treeitem", { name: "Sul" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("treeitem", { name: "Loja Porto" })).toBeDefined();
    expect(screen.getByRole("treeitem", { name: "Sul" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByRole("treeitem", { name: "Loja Porto" })).toBeNull();
  });
});
