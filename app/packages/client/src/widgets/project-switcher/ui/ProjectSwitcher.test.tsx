import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { ProjectSwitcher } from "./ProjectSwitcher.tsx";

describe("ProjectSwitcher", () => {
  it("lists the organization's projects and opens the chosen one", async () => {
    const { user, router } = renderWidget(<ProjectSwitcher />, { path: `/o/${IDS.organization}/p/${IDS.project}?unit=u1` });
    await user.click(await screen.findByRole("button", { name: "Launch, trocar de projeto" }));
    expect((await screen.findByRole("menuitemradio", { name: "Launch" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Novo projeto" })).toBeDefined();
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("menuitemradio", { name: "Beta" }));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/${IDS.otherProject}`));
  });

  it("hides create without core.project.create, says when there are no projects and hides outside an organization", async () => {
    const { user } = renderWidget(<ProjectSwitcher />, {
      path: `/o/${IDS.organization}`,
      permissions: ["core.organization.read", "core.project.read"],
      routes: { "GET /v1/organizations/:organizationId/projects": page([]) },
    });
    await user.click(await screen.findByRole("button", { name: "Escolher projeto, trocar de projeto" }));
    expect(await screen.findByRole("menuitem", { name: "Nenhum projeto ainda" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Novo projeto" })).toBeNull();

    const outside = renderWidget(<ProjectSwitcher />, { path: "/organizations" });
    expect(outside.container.querySelector("[data-slot=sidebar-menu]")).toBeNull();
  });
});
