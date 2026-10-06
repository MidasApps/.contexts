import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./Table.tsx";

describe("Table", () => {
  it("renders a captioned table with column headers and a focusable scroll region", async () => {
    const { container } = renderWithProviders(
      <Table scrollLabel="Membros">
        <TableCaption>Membros</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="text-end">Projetos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Ana</TableCell>
            <TableCell className="text-end font-mono">3</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Membros" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Nome" }).getAttribute("scope")).toBe("col");
    const region = screen.getByRole("region", { name: "Membros" });
    expect(region.getAttribute("tabindex")).toBe("0");
    await expectNoAxeViolations(container);
  });
});
