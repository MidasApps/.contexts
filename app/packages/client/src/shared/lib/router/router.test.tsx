import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { createMemoryRouter } from "./memory-router.tsx";
import { RouteLink, RouterProvider, useRouter } from "./router-context.tsx";

function Location() {
  const router = useRouter();
  const params = router.useRouteParams();
  return (
    <p>
      {router.useLocationPath()} | {params["projectId"] ?? "-"} | {router.useSearchParam("unit") ?? "-"}
    </p>
  );
}

describe("router port (memory adapter)", () => {
  it("navigates through RouteLink and re-renders params, path and search", async () => {
    const router = createMemoryRouter("/o/org/p/p1");
    const { user, container } = renderWithProviders(
      <RouterProvider router={router}>
        <Location />
        <RouteLink to={{ id: "project", organizationId: "org", projectId: "p2", unit: "u9" }}>Projeto 2</RouteLink>
      </RouterProvider>,
    );
    expect(screen.getByText("/o/org/p/p1 | p1 | -")).toBeDefined();
    const link = screen.getByRole("link", { name: "Projeto 2" });
    expect(link.getAttribute("href")).toBe("/o/org/p/p2?unit=u9");
    await user.click(link);
    expect(screen.getByText("/o/org/p/p2 | p2 | u9")).toBeDefined();
    expect(router.history()).toEqual(["/o/org/p/p1", "/o/org/p/p2?unit=u9"]);
    await expectNoAxeViolations(container);
  });

  it("replaces the current entry when asked and fails loudly without a provider", () => {
    const router = createMemoryRouter("/organizations");
    router.navigate({ id: "organization", organizationId: "org" }, { replace: true });
    expect(router.history()).toEqual(["/o/org"]);
    expect(() => renderWithProviders(<Location />)).toThrow(/RouterProvider/);
  });
});
