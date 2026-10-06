import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "#/shared/api/api-error.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { ApiErrorAlert } from "./ApiErrorAlert.tsx";

describe("ApiErrorAlert", () => {
  it("shows the code's copy and the reference, and takes focus", async () => {
    const error = new ApiError({ status: 422, code: "LAST_OWNER", message: "raw", requestId: "01K6REQ" });
    const { container } = renderWithProviders(<ApiErrorAlert error={error} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("A organização precisa de pelo menos um proprietário.");
    expect(alert.textContent).toContain("Referência: 01K6REQ");
    expect(alert.textContent).not.toContain("raw");
    expect(document.activeElement).toBe(alert);
    await expectNoAxeViolations(container);
  });
});
