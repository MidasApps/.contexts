import { IDS, MEMBER_PERMISSIONS, renderApp, shellRoutes } from "@core/client/testing";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileSectionPage, SettingsSectionPage } from "./section-views.tsx";

describe("section pages", () => {
  it.each([
    ["settings", <SettingsSectionPage key="s" />, "/o/org-1/settings/billing"],
    ["profile", <ProfileSectionPage key="p" section="admin" />, "/profile/admin"],
  ])("renders not found for a %s section outside the route map", async (_kind, page, path) => {
    renderApp(page, { path });

    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("renders not found for a tail under a section without detail pages", async () => {
    renderApp(<SettingsSectionPage />, { path: "/o/org-1/settings/members/whatever" });

    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("renders the section named by the address", async () => {
    renderApp(<SettingsSectionPage />, { path: `/o/${IDS.organization}/settings/general`, routes: shellRoutes(MEMBER_PERMISSIONS) });

    expect(await screen.findByRole("heading", { level: 1, name: "Geral" })).toBeDefined();
  });
});
