import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { ForbiddenView } from "./ForbiddenView.tsx";

describe("ForbiddenView", () => {
  it("renders the forbidden page with a link home", async () => {
    const { container } = renderWithClient(
      <main>
        <ForbiddenView />
      </main>,
      { locale: "en-US" },
    );
    expect(screen.getByRole("heading", { level: 1, name: "You don't have access to this page" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Go to home" }).getAttribute("href")).toBe("/");
    await expectNoAxeViolations(container);
  });
});
