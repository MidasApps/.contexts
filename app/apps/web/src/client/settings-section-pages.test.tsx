// @vitest-environment jsdom
import "@core/client/testing/setup";
import { IDS, MEMBER_PERMISSIONS, renderApp, shellRoutes } from "@core/client/testing";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsSectionPage } from "./settings-section-pages";

describe("SettingsSectionPage", () => {
  it("renders the section named by the address", async () => {
    renderApp(<SettingsSectionPage />, {
      path: `/admin/o/${IDS.organization}/general`,
      routes: shellRoutes(MEMBER_PERMISSIONS),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Geral" })).toBeDefined();
  });

  it.each(["billing", "members/whatever"])("renders not found for an organization section %s", async (tail) => {
    renderApp(<SettingsSectionPage />, { path: `/admin/o/${IDS.organization}/${tail}` });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
