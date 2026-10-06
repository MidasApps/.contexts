import { screen } from "@testing-library/react";
import { useTranslations } from "use-intl";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { contrastRatio, parseHexColor } from "#/shared/testing/contrast.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";

const SaveButton = () => {
  const t = useTranslations("common.actions");
  return <button type="button">{t("save")}</button>;
};

describe("renderWithProviders", () => {
  it("renders with pt-BR messages by default", () => {
    renderWithProviders(<SaveButton />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDefined();
  });

  it("switches locale and exposes a user-event instance", async () => {
    const { user } = renderWithProviders(<SaveButton />, { locale: "es-419" });
    const button = screen.getByRole("button", { name: "Guardar" });
    await user.click(button);
    expect(document.activeElement).toBe(button);
  });

  it("fails loudly on a missing message key", () => {
    const Missing = () => <p>{useTranslations("common")("doesNotExist")}</p>;
    expect(() => renderWithProviders(<Missing />)).toThrow(/doesNotExist/);
  });
});

describe("expectNoAxeViolations", () => {
  it("passes an accessible fragment", async () => {
    const { container } = renderWithProviders(<SaveButton />);
    await expectNoAxeViolations(container);
  });

  it("reports violations with their rule id", async () => {
    // eslint-disable-next-line jsx-a11y/alt-text -- deliberate violation: the helper must report it.
    const { container } = renderWithProviders(<img src="data:," />);
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/image-alt/);
  });
});

describe("contrastRatio", () => {
  it("computes WCAG ratios from hex colors", () => {
    expect(contrastRatio(parseHexColor("#000000"), parseHexColor("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseHexColor("#737373"), parseHexColor("#ffffff"))).toBeCloseTo(4.74, 2);
  });

  it("rejects colors that are not opaque hex", () => {
    expect(() => parseHexColor("#ffffff1a")).toThrow(RangeError);
    expect(() => parseHexColor("red")).toThrow(RangeError);
  });
});
