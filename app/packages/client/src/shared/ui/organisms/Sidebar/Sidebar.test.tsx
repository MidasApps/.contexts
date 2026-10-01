import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Sidebar, SidebarInset, SidebarRail, SidebarTrigger } from "./Sidebar.tsx";
import { SidebarProvider } from "./sidebar-context.tsx";
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "./sidebar-menu.tsx";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "./sidebar-sections.tsx";

const Shell = ({ persistState }: { persistState: (open: boolean) => void }) => (
  <SidebarProvider persistState={persistState}>
    <Sidebar>
      <nav aria-label="Principal">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel id="team-label">Equipe</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu aria-labelledby="team-label">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive tooltip="Membros">
                    <a href="/members">
                      <Icon name="users" />
                      <span>Membros</span>
                    </a>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>2</SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </nav>
      <SidebarRail />
    </Sidebar>
    <SidebarInset>
      <SidebarTrigger />
    </SidebarInset>
  </SidebarProvider>
);

const sidebarState = (): string | null => document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state") ?? null;

describe("Sidebar", () => {
  it("collapses with the trigger and persists through the injected callback", async () => {
    const persistState = vi.fn();
    const { user, container } = renderWithProviders(<Shell persistState={persistState} />);
    const trigger = screen.getByRole("button", { name: "Mostrar ou ocultar a barra lateral" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(sidebarState()).toBe("expanded");
    await expectNoAxeViolations(container);
    await user.click(trigger);
    expect(sidebarState()).toBe("collapsed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(persistState).toHaveBeenLastCalledWith(false);
  });

  it("toggles with Ctrl+B and ⌘B", async () => {
    const persistState = vi.fn();
    const { user } = renderWithProviders(<Shell persistState={persistState} />);
    await user.keyboard("{Control>}b{/Control}");
    expect(sidebarState()).toBe("collapsed");
    await user.keyboard("{Meta>}b{/Meta}");
    expect(sidebarState()).toBe("expanded");
    expect(persistState.mock.calls).toEqual([[false], [true]]);
  });

  it("marks the current page and keeps item names when collapsed", async () => {
    const { user } = renderWithProviders(<Shell persistState={() => undefined} />);
    const link = screen.getByRole("link", { name: "Membros" });
    expect(link.getAttribute("aria-current")).toBe("page");
    await user.click(screen.getByRole("button", { name: "Mostrar ou ocultar a barra lateral" }));
    expect(screen.getByRole("link", { name: "Membros" })).toBeDefined();
    expect(screen.getByRole("list", { name: "Equipe" })).toBeDefined();
  });
});
