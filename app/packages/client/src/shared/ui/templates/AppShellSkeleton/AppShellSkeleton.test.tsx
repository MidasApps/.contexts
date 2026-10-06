import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { AppShellSkeleton } from "./AppShellSkeleton.tsx";

const sidebarOf = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('[data-slot="app-shell-skeleton-sidebar"]');

describe("AppShellSkeleton", () => {
  it("draws the shell's frame and announces once, inside the only main, what is loading", async () => {
    const { container } = renderWithProviders(<AppShellSkeleton label="Abrindo seu último contexto…" />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main").id).toBe("main");
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Abrindo seu último contexto…");
    expect(container.querySelector('[data-slot="app-topbar-skeleton"]')?.className).toContain("h-14");
    expect(container.querySelector('[data-slot="page-header-skeleton"]')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("uses the sidebar's width, expanded by default and narrow when the user collapsed it", () => {
    const { container, unmount } = renderWithProviders(<AppShellSkeleton label="Carregando…" />);
    expect(sidebarOf(container)?.style.width).toBe(SIDEBAR_WIDTH);
    unmount();
    const collapsed = renderWithProviders(<AppShellSkeleton label="Carregando…" sidebarOpen={false} />);
    expect(sidebarOf(collapsed.container)?.style.width).toBe(SIDEBAR_WIDTH_ICON);
  });

  it("has no sidebar column on phones, where the sidebar is a sheet", () => {
    const { container } = renderWithProviders(<AppShellSkeleton label="Carregando…" />);
    expect(sidebarOf(container)?.className).toMatch(/(^|\s)hidden(\s|$)/u);
    expect(sidebarOf(container)?.className).toContain("md:flex");
  });
});
