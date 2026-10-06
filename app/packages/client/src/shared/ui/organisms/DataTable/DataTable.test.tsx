import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { DataTable } from "./DataTable.tsx";
import { dataTableColumnHelper } from "./data-table-columns.ts";

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
    const { user, rerender, container } = renderWithProviders(
      <DataTable {...props} data={[]} status={{ kind: "loading" }} />,
    );
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Carregando…");
    await expectNoAxeViolations(container);
    rerender(<DataTable {...props} data={[]} />);
    expect(screen.getByRole("heading", { name: "Nenhum membro" })).toBeDefined();
    const error = new ApiError({ status: 0, code: "NETWORK_ERROR", message: "offline", requestId: "req-1" });
    rerender(<DataTable {...props} data={[]} status={{ kind: "error", error, onRetry }} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Referência: req-1");
    expect(alert.textContent).toContain("Não foi possível conectar.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the retry as pending while the list is fetched again", () => {
    const error = new ApiError({ status: 503, code: "SERVICE_UNAVAILABLE", message: "down" });
    renderWithProviders(
      <DataTable
        caption="Membros"
        columns={COLUMNS}
        data={[]}
        getRowId={(row) => row.id}
        empty={EMPTY}
        status={{ kind: "error", error, onRetry: vi.fn(), retrying: true }}
      />,
    );
    const retry = screen.getByRole<HTMLButtonElement>("button", { name: /Tentar novamente/u });
    expect(retry.disabled).toBe(true);
  });

  it("renders the no-access state, without a retry, for a 403", async () => {
    const error = new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" });
    const { container } = renderWithProviders(
      <DataTable
        caption="Membros"
        columns={COLUMNS}
        data={[]}
        getRowId={(row) => row.id}
        empty={EMPTY}
        status={{ kind: "error", error, onRetry: vi.fn() }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    await expectNoAxeViolations(container);
  });
});

/** A ResizeObserver that reports one width for every observed element, at once. */
const withContainerWidth = async (width: number, run: () => void | Promise<void>) => {
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    readonly #callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }
    observe(target: Element) {
      this.#callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  };
  try {
    await run();
  } finally {
    globalThis.ResizeObserver = original;
  }
};

describe("DataTable in a narrow container", () => {
  const renderCard = (row: Member) => <span>{row.name}</span>;

  it("becomes cards when its container is narrower than its columns need, at any screen size", async () => {
    await withContainerWidth(320, async () => {
      const { container } = renderWithProviders(
        <DataTable
          caption="Membros"
          columns={COLUMNS}
          data={MEMBERS}
          getRowId={(row) => row.id}
          empty={EMPTY}
          renderCard={renderCard}
        />,
      );
      expect(screen.getByRole("list", { name: "Membros" })).toBeDefined();
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    });
  });

  it("stays a table when the container fits the columns, or when there is no card form", async () => {
    await withContainerWidth(900, () => {
      renderWithProviders(
        <DataTable
          caption="Membros"
          columns={COLUMNS}
          data={MEMBERS}
          getRowId={(row) => row.id}
          empty={EMPTY}
          renderCard={renderCard}
        />,
      );
      expect(screen.getByRole("table", { name: "Membros" })).toBeDefined();
    });
    await withContainerWidth(320, () => {
      renderWithProviders(
        <DataTable caption="Sem cartões" columns={COLUMNS} data={MEMBERS} getRowId={(row) => row.id} empty={EMPTY} />,
      );
      expect(screen.getByRole("table", { name: "Sem cartões" })).toBeDefined();
    });
  });

  it("takes the width its columns need from the caller", async () => {
    await withContainerWidth(700, () => {
      renderWithProviders(
        <DataTable
          caption="Membros"
          columns={COLUMNS}
          data={MEMBERS}
          getRowId={(row) => row.id}
          empty={EMPTY}
          renderCard={renderCard}
          minTableWidth={800}
        />,
      );
      expect(screen.getByRole("list", { name: "Membros" })).toBeDefined();
    });
  });
});

describe("DataTable on small screens", () => {
  it("renders a labelled card list instead of the table when renderCard is given", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = renderWithProviders(
        <DataTable
          caption="Membros"
          columns={COLUMNS}
          data={MEMBERS}
          getRowId={(row) => row.id}
          empty={EMPTY}
          renderCard={(row) => <span>{row.name}</span>}
        />,
      );
      const list = screen.getByRole("list", { name: "Membros" });
      expect(
        within(list)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["Ana", "Bruno"]);
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
