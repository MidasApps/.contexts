import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter } from "#/shared/lib/router/memory-router.tsx";
import { RouterProvider } from "#/shared/lib/router/router-context.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { OfflineBanner } from "./offline-banner.tsx";
import { RouteAnnouncer } from "./route-announcer.tsx";

afterEach(() => {
  vi.restoreAllMocks();
  document.title = "";
});

describe("RouteAnnouncer", () => {
  it("stays silent on the first render and announces the new page title after a navigation", async () => {
    const router = createMemoryRouter("/organizations");
    const { container } = renderWithProviders(
      <RouterProvider router={router}>
        <RouteAnnouncer />
      </RouterProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    document.title = "Perfil";
    act(() => router.navigate({ id: "profile", section: "account" }));
    await waitFor(() => expect(region.textContent).toBe("Perfil"));
    await expectNoAxeViolations(container);
  });

  it("falls back to generic copy when the page has neither title nor heading", async () => {
    const router = createMemoryRouter("/organizations");
    renderWithProviders(
      <RouterProvider router={router}>
        <RouteAnnouncer />
      </RouterProvider>,
    );
    act(() => router.navigate({ id: "home" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Nova página carregada"));
  });
});

describe("OfflineBanner", () => {
  it("shows the offline notice while the browser is offline and hides it when back online", async () => {
    const onLine = vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(true);
    const { container } = renderWithProviders(<OfflineBanner />);
    expect(container.textContent).toBe("");
    onLine.mockReturnValue(false);
    act(() => void globalThis.dispatchEvent(new Event("offline")));
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    await expectNoAxeViolations(container);
    onLine.mockReturnValue(true);
    act(() => void globalThis.dispatchEvent(new Event("online")));
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
