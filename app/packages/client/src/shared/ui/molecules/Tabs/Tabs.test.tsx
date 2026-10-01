import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs.tsx";

describe("Tabs", () => {
  it("moves between tabs with arrows and shows the labelled panel", async () => {
    const { user, container } = renderWithProviders(
      <Tabs defaultValue="members">
        <TabsList aria-label="Seções">
          <TabsTrigger value="members">Membros</TabsTrigger>
          <TabsTrigger value="invitations">Convites</TabsTrigger>
        </TabsList>
        <TabsContent value="members">Lista de membros</TabsContent>
        <TabsContent value="invitations">Lista de convites</TabsContent>
      </Tabs>,
    );
    await expectNoAxeViolations(container);
    screen.getByRole("tab", { name: "Membros" }).focus();
    await user.keyboard("{ArrowRight}");
    const invitations = screen.getByRole("tab", { name: "Convites" });
    expect(invitations.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Convites" }).textContent).toBe("Lista de convites");
  });

  it("uses the AA-safe muted token on the segmented track", () => {
    renderWithProviders(
      <Tabs defaultValue="a">
        <TabsList aria-label="Visibilidade">
          <TabsTrigger value="a">Privada</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist").className).toContain("text-muted-foreground-strong");
  });
});
