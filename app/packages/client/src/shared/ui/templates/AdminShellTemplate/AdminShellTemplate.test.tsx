import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Sidebar, SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { AdminShellTemplate } from "./AdminShellTemplate.tsx";

describe("AdminShellTemplate", () => {
  it("reuses the shell frame on the admin surface without a right panel", async () => {
    const { container } = renderWithProviders(
      <AdminShellTemplate
        sidebar={
          <Sidebar>
            <nav aria-label="Administração">
              <a href="/admin">Início</a>
            </nav>
          </Sidebar>
        }
        topbar={<SidebarTrigger />}
      >
        <h1>Administração</h1>
      </AdminShellTemplate>,
    );
    expect(container.querySelector("[data-surface=admin]")).not.toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Administração" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
