import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Badge } from "./Badge.tsx";

describe("Badge", () => {
  it("renders the design-system count and tag looks with AA text tokens", async () => {
    const { container } = renderWithProviders(
      <p>
        <Badge variant="count">2</Badge>
        <Badge variant="tag">Owner</Badge>
        <Badge variant="tag-violet">Beta</Badge>
      </p>,
    );
    expect(screen.getByText("2").className).toContain("bg-sidebar-primary");
    expect(screen.getByText("2").className).toContain("tabular-nums");
    expect(screen.getByText("Owner").className).toContain("uppercase");
    expect(screen.getByText("Beta").className).toContain("text-violet-foreground");
    await expectNoAxeViolations(container);
  });

  it("can render a link with the badge look", () => {
    renderWithProviders(
      <Badge asChild variant="outline">
        <a href="/inbox">Inbox</a>
      </Badge>,
    );
    expect(screen.getByRole("link", { name: "Inbox" }).dataset["slot"]).toBe("badge");
  });
});
