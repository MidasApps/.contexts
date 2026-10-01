import type { SupportedLocale } from "@core/i18n";
import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { endonym, LocaleSelect } from "./LocaleSelect.tsx";

const Picker = () => {
  const [value, setValue] = useState<SupportedLocale>("pt-BR");
  return (
    <>
      <Label htmlFor="language">Idioma</Label>
      <LocaleSelect id="language" value={value} onValueChange={setValue} />
    </>
  );
};

describe("endonym", () => {
  it("names each language in itself", () => {
    expect(endonym("pt-BR")).toBe("Português (Brasil)");
    expect(endonym("en-US")).toBe("English (United States)");
    expect(endonym("es-419")).toBe("Español (Latinoamérica)");
  });
});

describe("LocaleSelect", () => {
  it("lists languages with their own lang attribute and selects one", async () => {
    const { user, container } = renderWithProviders(<Picker />);
    await expectNoAxeViolations(container);
    const trigger = screen.getByRole("combobox", { name: "Idioma" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const english = await screen.findByRole("option", { name: "English (United States)" });
    expect(english.getAttribute("lang")).toBe("en-US");
    await user.click(english);
    expect(trigger.textContent).toContain("English (United States)");
  });
});
