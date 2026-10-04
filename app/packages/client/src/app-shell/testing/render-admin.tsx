// Test helper: renders an `/admin` view inside the app composition as a platform staff member.
import type { ReactElement } from "react";
import { buildStaffMe } from "#/shared/testing/admin-fixtures.ts";
import { type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { type RenderAppOptions, type RenderAppResult, renderApp } from "./render-app.tsx";

export type RenderAdminOptions = Omit<RenderAppOptions, "routes"> & {
  /** Staff role of the viewer (default `platform-admin`, which holds every `platform.*`). */
  role?: "platform-admin" | "platform-support";
  routes?: FakeRoutes;
};

/**
 * Renders `ui` inside `<main>` at `path` with `GET /v1/me` answering a staff profile; add the
 * `/v1/admin/*` routes the view reads. Wait for content with `findBy*`.
 */
export const renderAdmin = (
  ui: ReactElement,
  { role = "platform-admin", routes, ...options }: RenderAdminOptions = {},
): RenderAppResult =>
  renderApp(<main>{ui}</main>, {
    path: "/admin",
    ...options,
    routes: { "GET /v1/me": ok(buildStaffMe(role)), ...routes },
  });
