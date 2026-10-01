import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ApiErrorState } from "./ApiErrorState.tsx";

describe("ApiErrorState", () => {
  it("shows the copy of the error code and its reference, never the raw message", async () => {
    const onRetry = vi.fn();
    const error = new ApiError({ status: 409, code: "CONFLICT", message: "row version mismatch at db", requestId: "01K6REQ" });
    const { user, container } = renderWithProviders(<ApiErrorState error={error} onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Este item foi alterado por outra pessoa.");
    expect(alert.textContent).toContain("Referência: 01K6REQ");
    expect(alert.textContent).not.toContain("row version");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it("falls back to the internal error copy for unknown codes and non-API failures", () => {
    renderWithProviders(
      <>
        <ApiErrorState error={new ApiError({ status: 500, code: "SOMETHING_NEW", message: "x" })} headingLevel={3} />
        <ApiErrorState error={new TypeError("boom")} headingLevel={3} />
      </>,
    );
    expect(screen.getAllByText("Algo deu errado do nosso lado. Tente novamente em instantes.")).toHaveLength(2);
    expect(screen.queryByText(/Referência/u)).toBeNull();
  });
});
