import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { OfflineNotice } from "./OfflineNotice.tsx";

describe("OfflineNotice", () => {
  it("is a polite status with the offline copy and an optional retry", async () => {
    const onRetry = vi.fn();
    const { user, container } = renderWithProviders(<OfflineNotice onRetry={onRetry} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Você está sem conexão.");
    expect(status.className).toContain("text-amber-foreground");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });
});
