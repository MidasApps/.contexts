import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWidget } from "#/app-shell/testing/render-widget.tsx";
import { useProjects } from "#/entities/project/index.ts";
import { useMe } from "#/entities/session/index.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok, page } from "#/shared/testing/fake-api.ts";
import { buildMe, buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { ProjectSwitcher } from "./ProjectSwitcher.tsx";

/** Says when the two answers the default project mode reads (the user, the project list) have arrived. */
function ModeSettled() {
  const me = useMe();
  const projects = useProjects(IDS.organization);
  return me.isSuccess && projects.isSuccess ? <span>modo resolvido</span> : null;
}

describe("ProjectSwitcher", () => {
  it("lists the organization's projects and opens the chosen one", async () => {
    const { user, router } = renderWidget(<ProjectSwitcher />, {
      path: `/o/${IDS.organization}/p/${IDS.project}?unit=u1`,
    });
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

  it("is not rendered with one visible project and lists several without the create item when the default project is on", async () => {
    const me = ok(buildMe({ lastContext: { organizationId: IDS.organization }, organizationDefaultProject: true }));
    const one = renderWidget(
      <>
        <ProjectSwitcher />
        <ModeSettled />
      </>,
      {
        path: `/o/${IDS.organization}/p/${IDS.project}`,
        routes: { "GET /v1/me": me, "GET /v1/organizations/:organizationId/projects": page([buildProject()]) },
      },
    );
    // The switcher is also absent while the list loads: look only once the mode has its answers.
    expect(await screen.findByText("modo resolvido")).toBeDefined();
    expect(one.container.querySelector("[data-slot=sidebar-menu]")).toBeNull();
    one.unmount();

    const many = renderWidget(<ProjectSwitcher />, {
      path: `/o/${IDS.organization}/p/${IDS.project}`,
      routes: { "GET /v1/me": me },
    });
    // The mode asks for the project list once `GET /v1/me` has answered; the switcher is back when it arrives.
    await waitFor(() =>
      expect(many.api.callLines().some((line) => line.includes(`/v1/organizations/${IDS.organization}/projects`))).toBe(
        true,
      ),
    );
    await many.user.click(await screen.findByRole("button", { name: "Launch, trocar de projeto" }));
    expect(await screen.findByRole("menuitemradio", { name: "Beta" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Novo projeto" })).toBeNull();
  });
});
