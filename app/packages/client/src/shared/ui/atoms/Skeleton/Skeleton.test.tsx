import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Skeleton } from "./Skeleton.tsx";

describe("Skeleton", () => {
  it("is a hidden muted placeholder that pulses", async () => {
    const { container } = renderWithProviders(<Skeleton className="h-4 w-32" />);
    const skeleton = container.querySelector("[data-slot=skeleton]");
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.className).toContain("bg-muted");
    expect(skeleton?.className).toContain("animate-pulse");
    await expectNoAxeViolations(container);
  });
});
