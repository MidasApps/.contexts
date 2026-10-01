import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { CostCharts, type CostChartRow } from "./CostCharts.tsx";

const plain = (text: string | null | undefined): string => (text ?? "").replace(/\s/gu, " ");
const ROWS: CostChartRow[] = [
  { id: "a", label: "Northwind", costMicroUsd: 1_250_000, capMicroUsd: 50_000_000 },
  { id: "b", label: "Contoso", costMicroUsd: 12_000_000, capMicroUsd: 10_000_000 },
];

describe("CostCharts", () => {
  it("shows exactly the numbers it was given, highest cost first, and the API total", async () => {
    const { container } = renderWithProviders(<CostCharts rows={ROWS} totalCostMicroUsd={13_250_000} rowHeader="Organização" />);
    const table = screen.getByRole("table", { name: "Custo no mês e limite" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(["Contoso", "Northwind"]);
    expect(within(rows[0] as HTMLElement).getAllByRole("cell").map((cell) => plain(cell.textContent))).toEqual(["US$ 12,00", "US$ 10,00"]);
    expect(within(rows[1] as HTMLElement).getAllByRole("cell").map((cell) => plain(cell.textContent))).toEqual(["US$ 1,25", "US$ 50,00"]);
    expect(plain(screen.getByText(/Total do mês/u).textContent)).toBe("Total do mês: US$ 13,25");
    await expectNoAxeViolations(container);
  });

  it("draws only the highest costs and says how many are left out", () => {
    const many = Array.from({ length: 12 }, (_, index): CostChartRow => ({ id: String(index), label: `Org ${String(index)}`, costMicroUsd: index * 1_000_000, capMicroUsd: 20_000_000 }));
    renderWithProviders(<CostCharts rows={many} totalCostMicroUsd={66_000_000} rowHeader="Organização" />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Os 10 maiores custos de 12.")).toBeDefined();
    expect(screen.queryByRole("rowheader", { name: "Org 0" })).toBeNull();
  });
});
