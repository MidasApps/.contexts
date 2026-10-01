import { renderApp } from "@core/client/testing";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileSectionPage, SettingsSectionPage } from "./section-views.tsx";

describe("section pages", () => {
  it.each([
    ["settings", <SettingsSectionPage key="s" section="billing" />],
    ["profile", <ProfileSectionPage key="p" section="admin" />],
  ])("renders not found for a %s section outside the route map", async (_kind, page) => {
    renderApp(page);

    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
