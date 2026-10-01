import type { RouterPort } from "@core/client/shared/lib/router";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parsePlainSearch, stringifyPlainSearch } from "@/router-search.ts";
import { createDesktopRouterAdapter } from "./desktop-router-adapter.tsx";

const setup = (initialHref: string) => {
  const switchLocale = vi.fn();
  const reportError = vi.fn();
  const holder: { port?: RouterPort } = {};
  function Probe() {
    const { port } = holder;
    if (port === undefined) throw new Error("port not ready");
    const params = port.useRouteParams();
    return (
      <div>
        <p data-testid="path">{port.useLocationPath()}</p>
        <p data-testid="params">{JSON.stringify(params)}</p>
        <p data-testid="unit">{String(port.useSearchParam("unit"))}</p>
        <port.Link to={{ id: "settings", organizationId: "org-1", section: "members" }}>members</port.Link>
      </div>
    );
  }
  const root = createRootRoute({ component: Outlet });
  const tree = root.addChildren([createRoute({ getParentRoute: () => root, path: "/", component: Probe }), createRoute({ getParentRoute: () => root, path: "$", component: Probe })]);
  const router = createRouter({ routeTree: tree, history: createMemoryHistory({ initialEntries: [initialHref] }), parseSearch: parsePlainSearch, stringifySearch: stringifyPlainSearch });
  const port = createDesktopRouterAdapter({ navigate: (args) => router.navigate(args), switchLocale, reportError });
  holder.port = port;
  render(<RouterProvider router={router} />);
  return { port, router, switchLocale, reportError };
};

describe("createDesktopRouterAdapter", () => {
  it("builds hrefs from the shared route map, without a locale prefix", () => {
    const { port } = setup("/");

    expect(port.href({ id: "project", organizationId: "a b", projectId: "p", unit: "u" })).toBe("/o/a%20b/p/p?unit=u");
    expect(port.href({ id: "profile", section: "security" })).toBe("/profile/security");
  });

  it("exposes the route-map params, the path and raw search values of the current location", async () => {
    setup("/o/org-1/p/proj-1/m/example/items/42?unit=123");

    expect((await screen.findByTestId("path")).textContent).toBe("/o/org-1/p/proj-1/m/example/items/42");
    expect(screen.getByTestId("params").textContent).toBe(JSON.stringify({ organizationId: "org-1", projectId: "proj-1", moduleId: "example", rest: "items/42", unit: "123" }));
    expect(screen.getByTestId("unit").textContent).toBe("123");
  });

  it("reads the invitation token from the fragment", async () => {
    setup("/invite#token=abc");

    expect((await screen.findByTestId("params")).textContent).toBe(JSON.stringify({ token: "abc" }));
  });

  it("navigates to a route, pushing or replacing the history entry", async () => {
    const { port, router } = setup("/organizations");
    await screen.findByTestId("path");

    act(() => port.navigate({ id: "organization", organizationId: "org-1" }));
    await vi.waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/o/org-1"));
    act(() => port.navigate({ id: "project", organizationId: "org-1", projectId: "p-1" }, { replace: true }));

    await vi.waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/o/org-1/p/p-1"));
    expect(router.history.length).toBe(2);
  });

  it("renders links as anchors that navigate client-side on a plain click", async () => {
    setup("/");
    const link = await screen.findByRole("link", { name: "members" });

    expect(link.getAttribute("href")).toBe("/o/org-1/settings/members");
    await userEvent.click(link);

    await vi.waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/o/org-1/settings/members"));
  });

  it("delegates locale switches to the desktop intl store", () => {
    const { port, switchLocale } = setup("/");

    port.switchLocale("en-US");

    expect(switchLocale).toHaveBeenCalledWith("en-US");
  });

  it("reports a failed navigation instead of leaving a floating rejection", async () => {
    const reportError = vi.fn();
    const failure = new Error("navigation failed");
    const port = createDesktopRouterAdapter({ navigate: () => Promise.reject(failure), switchLocale: vi.fn(), reportError });

    port.navigate({ id: "home" });

    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure, { operation: "navigate" }));
  });
});
