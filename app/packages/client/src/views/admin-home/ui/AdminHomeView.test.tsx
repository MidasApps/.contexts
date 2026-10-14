import { LastContextSchema } from "@core/contracts";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { AdminHomeView, adminHomeRoute } from "./AdminHomeView.tsx";

const renderHome = (me: Parameters<typeof buildMe>[0]) =>
  renderApp(<AdminHomeView />, { path: "/admin", routes: { "GET /v1/me": ok(buildMe(me)) } });

describe("AdminHomeView", () => {
  it("opens the settings of the organization used last", async () => {
    const { router } = renderHome({ lastContext: { organizationId: IDS.organization } });
    await waitFor(() => expect(router.current()).toBe(`/admin/o/${IDS.organization}`));
  });

  it("opens the platform console for staff", async () => {
    const { router } = renderHome({
      isPlatformStaff: true,
      platformRole: "platform-support",
      lastContext: { organizationId: IDS.organization },
    });
    await waitFor(() => expect(router.current()).toBe("/admin/platform"));
  });

  it("tells a user without organizations where to start", async () => {
    const { container, router } = renderHome({ lastContext: {} });
    expect(await screen.findByRole("heading", { name: "Você ainda não participa de uma organização" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver organizações" }).getAttribute("href")).toBe("/organizations");
    expect(router.current()).toBe("/admin");
    await expectNoAxeViolations(container);
  });

  it("never sends the desktop to the web-only console", () => {
    const lastContext = LastContextSchema.parse({ organizationId: IDS.organization });
    expect(adminHomeRoute({ isPlatformStaff: true, lastContext }, false)).toEqual({
      id: "settings-index",
      organizationId: IDS.organization,
    });
    expect(adminHomeRoute({ isPlatformStaff: true, lastContext: {} }, false)).toBeNull();
  });
});
