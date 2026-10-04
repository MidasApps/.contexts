import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { HomeView, lastContextRoute } from "./HomeView.tsx";

describe("HomeView", () => {
  it("redirects to the last project and unit used", async () => {
    const lastContext = { organizationId: IDS.organization, projectId: IDS.project, unitId: IDS.unit };
    const { router, container } = renderApp(<HomeView />, { routes: { "GET /v1/me": ok(buildMe({ lastContext })) } });
    expect(screen.getByRole("status")).toBeDefined();
    await expectNoAxeViolations(container);
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/${IDS.project}?unit=${IDS.unit}`));
    expect(router.history()).toHaveLength(1);
  });

  it("goes to the organizations page without a last context", async () => {
    const { router } = renderApp(<HomeView />);
    await waitFor(() => expect(router.current()).toBe("/organizations"));
    expect(lastContextRoute({ organizationId: IDS.organization } as Parameters<typeof lastContextRoute>[0])).toEqual({
      id: "organization",
      organizationId: IDS.organization,
    });
  });

  it("offers a retry with the reference when the profile cannot load", async () => {
    const { container } = renderApp(<HomeView />, { routes: { "GET /v1/me": apiError(404, "NOT_FOUND") } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não encontramos o que você procurava.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
