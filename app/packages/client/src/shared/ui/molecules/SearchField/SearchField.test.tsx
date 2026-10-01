import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SearchField } from "./SearchField.tsx";

const Search = () => {
  const [value, setValue] = useState("");
  return <SearchField value={value} onValueChange={setValue} />;
};

describe("SearchField", () => {
  it("is a labelled search box whose clear button empties it and refocuses", async () => {
    const { user, container } = renderWithProviders(<Search />);
    const box = screen.getByRole("searchbox", { name: "Buscar" });
    expect(screen.queryByRole("button", { name: "Limpar busca" })).toBeNull();
    await user.type(box, "membros");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect((box as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(box);
  });
});
