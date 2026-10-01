import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { BarChartFigure } from "./BarChartFigure.tsx";

const SERIES = [
  { key: "cost", label: "Custo" },
  { key: "cap", label: "Limite" },
];
const ROWS = [
  { id: "a", label: "Northwind", values: { cost: 12, cap: 50 } },
  { id: "b", label: "Contoso", values: { cost: 3, cap: null } },
];

describe("BarChartFigure", () => {
  it("gives the same numbers as a table to assistive technology and hides the drawing", async () => {
    const { container } = renderWithProviders(
      <BarChartFigure title="Custo por organização" description="Mês atual" series={SERIES} rows={ROWS} rowHeader="Organização" formatValue={(value) => `$${String(value)}`} />,
    );
    const table = screen.getByRole("table", { name: "Custo por organização" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Organização", "Custo", "Limite"]);
    const northwind = within(table).getByRole("row", { name: /Northwind/u });
    expect(within(northwind).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["$12", "$50"]);
    expect(within(within(table).getByRole("row", { name: /Contoso/u })).getAllByRole("cell")[1]?.textContent).toBe("—");
    expect(screen.getByText("Mês atual")).toBeDefined();
    expect(container.querySelector("[aria-hidden='true'].h-64")).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("names every series in the legend, not by color alone", () => {
    renderWithProviders(<BarChartFigure title="T" series={SERIES} rows={ROWS} rowHeader="R" formatValue={String} />);
    const legend = screen.getByRole("list");
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Custo", "Limite"]);
  });
});
