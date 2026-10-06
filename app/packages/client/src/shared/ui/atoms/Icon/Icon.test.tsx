import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Icon } from "./Icon.tsx";
import { isIconName } from "./icon-registry.ts";

describe("Icon", () => {
  it("is decorative without a label", async () => {
    const { container } = renderWithProviders(
      <p>
        <Icon name="settings" /> Configurações
      </p>,
    );
    const svg = container.querySelector("svg[data-icon=settings]");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("is an image with a name when labelled", async () => {
    const { container } = renderWithProviders(<Icon name="wifi-off" label="Sem conexão" />);
    expect(screen.getByRole("img", { name: "Sem conexão" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("only accepts allowlisted names", () => {
    expect(isIconName("home")).toBe(true);
    expect(isIconName("toString")).toBe(false);
    expect(isIconName("rocket")).toBe(false);
  });
});
