// @vitest-environment jsdom
import "@core/client/testing/setup";
import { IDS, MEMBER_PERMISSIONS, renderApp, shellRoutes } from "@core/client/testing";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsSectionPage } from "./section-pages";

describe("SettingsSectionPage", () => {
  it("renders the section named by the address", async () => {
    renderApp(<SettingsSectionPage />, {
      path: `/o/${IDS.organization}/settings/general`,
      routes: shellRoutes(MEMBER_PERMISSIONS),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Geral" })).toBeDefined();
  });

  it.each(["billing", "members/whatever"])("renders not found for settings/%s", async (tail) => {
    renderApp(<SettingsSectionPage />, { path: `/o/${IDS.organization}/settings/${tail}` });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
