import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "./Breadcrumb.tsx";

describe("Breadcrumb", () => {
  it("is a labelled navigation with the current page marked", async () => {
    const { container } = renderWithProviders(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/o/1">Organização</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Configurações</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(screen.getByRole("navigation", { name: "Trilha de navegação" })).toBeDefined();
    expect(screen.getByText("Configurações").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Organização" })).toBeDefined();
    expect(screen.getByText("Mais").className).toBe("sr-only");
    await expectNoAxeViolations(container);
  });
});
