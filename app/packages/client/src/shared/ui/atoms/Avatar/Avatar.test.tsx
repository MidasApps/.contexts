import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Avatar } from "./Avatar.tsx";
import { avatarToneFor, initialsOf } from "./avatar-identity.ts";

describe("initialsOf / avatarToneFor", () => {
  it("takes two initials from first and last word, or two letters of one word", () => {
    expect(initialsOf("Ana Maria Bezerra")).toBe("AB");
    expect(initialsOf("  élise ")).toBe("ÉL");
    expect(initialsOf("Bot")).toBe("BO");
  });

  it("gives the same name the same tone", () => {
    expect(avatarToneFor("Carla Ribeiro")).toBe(avatarToneFor("carla ribeiro "));
  });
});

describe("Avatar", () => {
  it("shows initials with the name for assistive tech", async () => {
    const { container } = renderWithProviders(<Avatar name="Ana Bezerra" />);
    expect(screen.getByText("AB").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Ana Bezerra").className).toContain("sr-only");
    await expectNoAxeViolations(container);
  });

  it("announces presence as text, only from md up", () => {
    const { rerender } = renderWithProviders(<Avatar name="Ana Bezerra" presence="away" size="md" />);
    expect(screen.getByText("Ausente")).toBeDefined();
    rerender(<Avatar name="Ana Bezerra" presence="away" size="sm" />);
    expect(screen.queryByText("Ausente")).toBeNull();
  });

  it("is hidden from assistive tech when decorative", () => {
    const { container } = renderWithProviders(<Avatar name="Ana Bezerra" decorative />);
    expect(container.querySelector("[data-slot=avatar]")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText("Ana Bezerra")).toBeNull();
  });
});
