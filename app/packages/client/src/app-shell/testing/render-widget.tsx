// Test helper: renders a sidebar/topbar widget inside the app composition and a SidebarProvider
// (the widgets read the sidebar state), with the shell routes of `shell-routes.ts`.
import type { Permission } from "@core/contracts";
import type { ReactElement } from "react";
import { SidebarProvider } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { renderApp, type RenderAppOptions, type RenderAppResult } from "./render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "./shell-routes.ts";

export const renderWidget = (
  ui: ReactElement,
  options: RenderAppOptions & { permissions?: readonly Permission[] } = {},
): RenderAppResult => {
  const { permissions = MEMBER_PERMISSIONS, routes, ...rest } = options;
  return renderApp(
    <SidebarProvider>
      <main>{ui}</main>
    </SidebarProvider>,
    { ...rest, routes: shellRoutes(permissions, routes) },
  );
};
