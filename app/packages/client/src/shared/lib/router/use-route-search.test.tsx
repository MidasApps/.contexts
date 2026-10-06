import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { createMemoryRouter } from "./memory-router.tsx";
import { RouterProvider } from "./router-context.tsx";
import { useSettingsSearch } from "./use-route-search.ts";

function TabSwitch() {
  const search = useSettingsSearch(["tab"]);
  return (
    <>
      <p>tab: {search.values.tab ?? "-"}</p>
      <button type="button" onClick={() => search.set({ tab: "schedules" })}>
        schedules
      </button>
    </>
  );
}

describe("useRouteSearch", () => {
  it("writes tabs and filters as another address of the page on screen, without building it again", async () => {
    // A navigation would wait for the server before the tab changes; a second tab clicked in that
    // window was dropped and the first one won (e2e settings-workflows, follow-up of the gate).
    const router = createMemoryRouter("/o/org/settings/workflows");
    const navigate = vi.spyOn(router, "navigate");
    const { user } = renderWithProviders(
      <RouterProvider router={router}>
        <TabSwitch />
      </RouterProvider>,
    );
    await user.click(screen.getByRole("button", { name: "schedules" }));
    expect(navigate).toHaveBeenCalledWith(
      { id: "settings", organizationId: "org", section: "workflows", search: { tab: "schedules" } },
      { replace: true, samePage: true },
    );
    expect(screen.getByText("tab: schedules")).toBeDefined();
    expect(router.history()).toEqual(["/o/org/settings/workflows?tab=schedules"]);
  });
});
