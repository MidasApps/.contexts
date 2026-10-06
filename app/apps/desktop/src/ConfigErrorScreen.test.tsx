import { expectNoAxeViolations } from "@core/client/testing";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfigErrorScreen } from "./ConfigErrorScreen.tsx";

describe("ConfigErrorScreen", () => {
  it("names the invalid variables in the user's language, accessibly", async () => {
    const { container } = render(<ConfigErrorScreen fields={["VITE_API_URL", "VITE_APP_ENV"]} locale="en-US" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Configuration error");
    expect(screen.getByRole("alert").textContent).toContain("VITE_API_URL, VITE_APP_ENV");
    await expectNoAxeViolations(container);
  });
});
