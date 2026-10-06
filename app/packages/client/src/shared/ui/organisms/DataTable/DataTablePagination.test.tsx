import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { DataTablePagination } from "./DataTablePagination.tsx";

describe("DataTablePagination", () => {
  it("disables both directions while a page is loading", async () => {
    const { container } = renderWithProviders(
      <DataTablePagination
        hasPrevious
        hasNext
        pending
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        label="Páginas de membros"
      />,
      { locale: "es-419" },
    );
    expect(screen.getByRole("navigation", { name: "Páginas de membros" })).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Anterior" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Siguiente" }).disabled).toBe(true);
    await expectNoAxeViolations(container);
  });
});
