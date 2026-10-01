import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { SectionNav } from "./SectionNav.tsx";

const ITEMS = [
  { id: "a", label: "Conta", icon: "user", to: { id: "profile", section: "account" }, current: true },
  { id: "b", label: "Sessões", icon: "monitor", to: { id: "profile", section: "sessions" }, current: false },
] as const;

describe("SectionNav", () => {
  it("links every section and marks the current one", async () => {
    const { container } = renderWithClient(
      <nav aria-label="Seções">
        <SectionNav items={ITEMS} />
      </nav>,
    );
    expect(screen.getByRole("link", { name: "Conta" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Sessões" }).getAttribute("href")).toBe("/profile/sessions");
    await expectNoAxeViolations(container);
  });

  it("shows a labelled skeleton while access loads", () => {
    renderWithClient(<SectionNav items={[]} loading loadingLabel="Carregando seções" />);
    expect(screen.getByRole("status", { name: "Carregando seções" })).toBeDefined();
  });
});
