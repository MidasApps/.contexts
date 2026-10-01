import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { dataTableColumnHelper } from "./data-table-columns.ts";
import { DataTable } from "./DataTable.tsx";

type Member = { id: string; name: string; projects: number };

const column = dataTableColumnHelper<Member>();
const COLUMNS = [
  column.accessor("name", { header: () => "Nome" }),
  column.accessor("projects", { header: () => "Projetos", meta: { numeric: true } }),
  column.display({ id: "actions", header: () => "Ações", meta: { headerHidden: true }, cell: () => "…" }),
];
const MEMBERS: Member[] = [
  { id: "m1", name: "Ana", projects: 3 },
  { id: "m2", name: "Bruno", projects: 12 },
];
const EMPTY = <EmptyState frame="plain" headingLevel={3} title="Nenhum membro" />;

describe("DataTable", () => {
  it("renders the caption, scoped headers and rows, numeric cells in mono", async () => {
    const { container } = renderWithProviders(
      <DataTable caption="Membros" columns={COLUMNS} data={MEMBERS} getRowId={(row) => row.id} empty={EMPTY} />,
    );
    const table = screen.getByRole("table", { name: "Membros" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.getAttribute("scope"))).toEqual(["col", "col", "col"]);
    expect(screen.getByText("Ações").className).toBe("sr-only");
    expect(screen.getByRole("cell", { name: "12" }).className).toContain("font-mono");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    await expectNoAxeViolations(container);
  });

  it("pages with cursor callbacks and disables unavailable directions", async () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const { user } = renderWithProviders(
      <DataTable
        caption="Membros"
        columns={COLUMNS}
        data={MEMBERS}
        getRowId={(row) => row.id}
        empty={EMPTY}
        pagination={{ hasPrevious: false, hasNext: true, onNext, onPrevious }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Paginação" });
    const previous = within(nav).getByRole<HTMLButtonElement>("button", { name: "Anterior" });
    expect(previous.disabled).toBe(true);
    await user.click(within(nav).getByRole("button", { name: "Próxima" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it("shows loading, empty and error states", async () => {
    const onRetry = vi.fn();
    const props = { caption: "Membros", columns: COLUMNS, getRowId: (row: Member) => row.id, empty: EMPTY };
    const { user, rerender, container } = renderWithProviders(<DataTable {...props} data={[]} status={{ kind: "loading" }} />);
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Carregando…");
    await expectNoAxeViolations(container);
    rerender(<DataTable {...props} data={[]} />);
    expect(screen.getByRole("heading", { name: "Nenhum membro" })).toBeDefined();
    rerender(<DataTable {...props} data={[]} status={{ kind: "error", requestId: "req-1", onRetry }} />);
    expect(screen.getByRole("alert").textContent).toContain("Referência: req-1");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable on small screens", () => {
  it("renders a labelled card list instead of the table when renderCard is given", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") }));
    try {
      const { container } = renderWithProviders(
        <DataTable caption="Membros" columns={COLUMNS} data={MEMBERS} getRowId={(row) => row.id} empty={EMPTY} renderCard={(row) => <span>{row.name}</span>} />,
      );
      const list = screen.getByRole("list", { name: "Membros" });
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Ana", "Bruno"]);
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
