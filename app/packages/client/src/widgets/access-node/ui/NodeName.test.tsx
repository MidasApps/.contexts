import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { NodeName } from "./NodeName.tsx";

describe("NodeName", () => {
  it("names the organization, a project and a hidden unit in words", async () => {
    const { container } = renderApp(
      <ul>
        <li>
          <NodeName node={{ level: "organization", tenantId: IDS.organization }} />
        </li>
        <li>
          <NodeName node={{ level: "project", tenantId: IDS.organization, projectId: IDS.project }} />
        </li>
        <li>
          <NodeName node={{ level: "unit", tenantId: IDS.organization, projectId: IDS.project, unitId: "gone" }} />
        </li>
      </ul>,
      { routes: shellRoutes([], { "GET /v1/projects/:projectId": ok(buildProject()), "GET /v1/units/:unitId": apiError(404, "NOT_FOUND") }) },
    );
    expect(screen.getByText("Toda a organização")).toBeDefined();
    expect(await screen.findByText("Launch")).toBeDefined();
    expect(await screen.findByText("Unidade oculta")).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
