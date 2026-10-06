import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Kbd, KbdGroup } from "./Kbd.tsx";

describe("Kbd", () => {
  it("renders the shortcut keys in mono with the AA-safe muted token", async () => {
    const { container } = renderWithProviders(
      <p>
        Abrir paleta
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </p>,
    );
    const key = screen.getByText("K");
    expect(key.tagName).toBe("KBD");
    expect(key.className).toContain("font-mono");
    expect(key.className).toContain("text-muted-foreground-strong");
    await expectNoAxeViolations(container);
  });
});
