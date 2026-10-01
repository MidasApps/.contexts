import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ErrorState } from "./ErrorState.tsx";

describe("ErrorState", () => {
  it("alerts with default copy, the request reference and a retry", async () => {
    const onRetry = vi.fn();
    const { user, container } = renderWithProviders(<ErrorState requestId="01J8Z3K4M5N6P7Q8R9S0T1V2W3" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Não foi possível carregar");
    expect(screen.getByText("Referência: 01J8Z3K4M5N6P7Q8R9S0T1V2W3").className).toContain("font-mono");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });

  it("disables retry while retrying and hides it without a handler", () => {
    const { rerender } = renderWithProviders(<ErrorState onRetry={() => undefined} retrying />, { locale: "en-US" });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Try again" }).disabled).toBe(true);
    rerender(<ErrorState title="Custom" description="Details" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "Custom" })).toBeDefined();
  });
});
