import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { isApplePlatform } from "#/shared/lib/shortcuts/modifier-key.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AppTopbar } from "./AppTopbar.tsx";

describe("AppTopbar", () => {
  it("shows organization › page on a settings page and opens the palette", async () => {
    const onOpen = vi.fn();
    const { user, container } = renderWidget(<AppTopbar onOpenCommandPalette={onOpen} />, {
      path: `/o/${IDS.organization}/settings/members`,
    });
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(await within(breadcrumb).findByRole("link", { name: "Northwind" })).toBeDefined();
    expect(within(breadcrumb).getByText("Membros").getAttribute("aria-current")).toBe("page");
    const trigger = screen.getByRole("button", { name: /Abrir paleta de comandos/u });
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Control+K");
    expect(within(trigger).getByText("Ctrl")).toBeDefined();
    await user.click(trigger);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Mostrar ou ocultar a barra lateral" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("names the unit path of the node and the profile page outside a tenant", async () => {
    renderWidget(<AppTopbar onOpenCommandPalette={() => undefined} />, {
      path: `/o/${IDS.organization}/p/${IDS.project}?unit=floor-1`,
    });
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(await within(breadcrumb).findByRole("link", { name: "Floor 2" })).toBeDefined();
    expect(await within(breadcrumb).findByRole("link", { name: "Site A" })).toBeDefined();
    expect(isApplePlatform({ platform: "MacIntel" } as Navigator)).toBe(true);
    expect(isApplePlatform({ platform: "Win32" } as Navigator)).toBe(false);
  });
});
