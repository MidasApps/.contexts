import { NotFoundView } from "@core/client/views/not-found";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { DesktopRoot } from "@/app/desktop-root.tsx";
import type { RouterContext } from "@/router-context.ts";

// Every desktop page renders inside the shared client providers; paths outside the route map
// (including the web-only `/admin`) render the shared not-found view.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundView,
});

function RootLayout() {
  const { app } = Route.useRouteContext();
  return (
    <DesktopRoot app={app}>
      <Outlet />
    </DesktopRoot>
  );
}
