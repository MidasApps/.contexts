import type { Permission } from "@core/contracts";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsIndexView } from "./SettingsIndexView.tsx";

const INDEX_PATH = `/o/${IDS.organization}/settings`;

const renderIndex = (permissions: readonly Permission[], overrides = {}) =>
  renderApp(
    <main>
      <SettingsIndexView />
    </main>,
    { path: INDEX_PATH, routes: shellRoutes(permissions, overrides) },
  );

describe("SettingsIndexView", () => {
  it("opens the first settings section the viewer can read, replacing the bare address", async () => {
    const { router } = renderIndex(["core.organization.read", "core.member.read"]);
    await waitFor(() => expect(router.current()).toBe(`${INDEX_PATH}/general`));
    expect(router.history()).not.toContain(INDEX_PATH);
  });

  it("skips the sections the viewer cannot read", async () => {
    const { router } = renderIndex(["core.member.read", "core.workflow-run.read"]);
    await waitFor(() => expect(router.current()).toBe(`${INDEX_PATH}/members`));
  });

  it("says the viewer has no access when no section is readable", async () => {
    const { router, container } = renderIndex(["core.project.read"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(router.current()).toBe(INDEX_PATH);
    await expectNoAxeViolations(container);
  });

  it("answers not-found for an organization the viewer cannot see", async () => {
    renderIndex([], { "GET /v1/me/context": apiError(404, "NOT_FOUND") });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
