import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { buildTimeZoneGroups, TimeZoneSelect } from "./TimeZoneSelect.tsx";

const NOW = new Date("2026-01-15T12:00:00Z");

const Picker = () => {
  const [value, setValue] = useState<string | undefined>("America/Sao_Paulo");
  return (
    <>
      <Label htmlFor="tz">Fuso horário</Label>
      <TimeZoneSelect id="tz" value={value} onValueChange={setValue} now={NOW} />
    </>
  );
};

describe("buildTimeZoneGroups", () => {
  it("groups zones by region with the current offset in the label", () => {
    const america = buildTimeZoneGroups("pt-BR", NOW).find((group) => group.heading === "America");
    const saoPaulo = america?.options.find((option) => option.value === "America/Sao_Paulo");
    expect(saoPaulo?.label).toBe("(GMT-03:00) America/Sao Paulo");
  });
});

describe("TimeZoneSelect", () => {
  it("searches by city and picks a zone in another region", async () => {
    const { user, container } = renderWithProviders(<Picker />);
    await expectNoAxeViolations(container);
    const trigger = screen.getByRole("combobox", { name: "Fuso horário" });
    expect(trigger.textContent).toContain("America/Sao Paulo");
    await user.click(trigger);
    await user.type(await screen.findByRole("combobox", { name: "Buscar fuso horário" }), "Kolkata");
    await user.keyboard("{Enter}");
    expect(trigger.textContent).toContain("(GMT+05:30) Asia/Kolkata");
  });
});
